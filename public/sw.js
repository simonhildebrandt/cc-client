(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

const instanceOfAny = (object, constructors) => constructors.some(c => object instanceof c);

let idbProxyableTypes;
let cursorAdvanceMethods;
// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes() {
    return idbProxyableTypes ||
        (idbProxyableTypes = [IDBDatabase, IDBObjectStore, IDBIndex, IDBCursor, IDBTransaction]);
}
// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods() {
    return cursorAdvanceMethods || (cursorAdvanceMethods = [
        IDBCursor.prototype.advance,
        IDBCursor.prototype.continue,
        IDBCursor.prototype.continuePrimaryKey,
    ]);
}
const cursorRequestMap = new WeakMap();
const transactionDoneMap = new WeakMap();
const transactionStoreNamesMap = new WeakMap();
const transformCache = new WeakMap();
const reverseTransformCache = new WeakMap();
function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
        const unlisten = () => {
            request.removeEventListener('success', success);
            request.removeEventListener('error', error);
        };
        const success = () => {
            resolve(wrap(request.result));
            unlisten();
        };
        const error = () => {
            reject(request.error);
            unlisten();
        };
        request.addEventListener('success', success);
        request.addEventListener('error', error);
    });
    promise.then((value) => {
        // Since cursoring reuses the IDBRequest (*sigh*), we cache it for later retrieval
        // (see wrapFunction).
        if (value instanceof IDBCursor) {
            cursorRequestMap.set(value, request);
        }
    });
    // This mapping exists in reverseTransformCache but doesn't doesn't exist in transformCache. This
    // is because we create many promises from a single IDBRequest.
    reverseTransformCache.set(promise, request);
    return promise;
}
function cacheDonePromiseForTransaction(tx) {
    // Early bail if we've already created a done promise for this transaction.
    if (transactionDoneMap.has(tx))
        return;
    const done = new Promise((resolve, reject) => {
        const unlisten = () => {
            tx.removeEventListener('complete', complete);
            tx.removeEventListener('error', error);
            tx.removeEventListener('abort', error);
        };
        const complete = () => {
            resolve();
            unlisten();
        };
        const error = () => {
            reject(tx.error);
            unlisten();
        };
        tx.addEventListener('complete', complete);
        tx.addEventListener('error', error);
        tx.addEventListener('abort', error);
    });
    // Cache it for later retrieval.
    transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
    get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
            // Special handling for transaction.done.
            if (prop === 'done')
                return transactionDoneMap.get(target);
            // Polyfill for objectStoreNames because of Edge.
            if (prop === 'objectStoreNames') {
                return target.objectStoreNames || transactionStoreNamesMap.get(target);
            }
            // Make tx.store return the only store in the transaction, or undefined if there are many.
            if (prop === 'store') {
                return receiver.objectStoreNames[1] ?
                    undefined : receiver.objectStore(receiver.objectStoreNames[0]);
            }
        }
        // Else transform whatever we get back.
        return wrap(target[prop]);
    },
    has(target, prop) {
        if (target instanceof IDBTransaction && (prop === 'done' || prop === 'store'))
            return true;
        return prop in target;
    },
};
function addTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
    // Due to expected object equality (which is enforced by the caching in `wrap`), we
    // only create one new func per func.
    // Edge doesn't support objectStoreNames (booo), so we polyfill it here.
    if (func === IDBDatabase.prototype.transaction &&
        !('objectStoreNames' in IDBTransaction.prototype)) {
        return function (storeNames, ...args) {
            const tx = func.call(unwrap(this), storeNames, ...args);
            transactionStoreNamesMap.set(tx, storeNames.sort ? storeNames.sort() : [storeNames]);
            return wrap(tx);
        };
    }
    // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
    // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
    // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
    // with real promises, so each advance methods returns a new promise for the cursor object, or
    // undefined if the end of the cursor has been reached.
    if (getCursorAdvanceMethods().includes(func)) {
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            func.apply(unwrap(this), args);
            return wrap(cursorRequestMap.get(this));
        };
    }
    return function (...args) {
        // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
        // the original object.
        return wrap(func.apply(unwrap(this), args));
    };
}
function transformCachableValue(value) {
    if (typeof value === 'function')
        return wrapFunction(value);
    // This doesn't return, it just creates a 'done' promise for the transaction,
    // which is later returned for transaction.done (see idbObjectHandler).
    if (value instanceof IDBTransaction)
        cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
        return new Proxy(value, idbProxyTraps);
    // Return the same value back if we're not going to transform it.
    return value;
}
function wrap(value) {
    // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
    // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
    if (value instanceof IDBRequest)
        return promisifyRequest(value);
    // If we've already transformed this value before, reuse the transformed value.
    // This is faster, but it also provides object equality.
    if (transformCache.has(value))
        return transformCache.get(value);
    const newValue = transformCachableValue(value);
    // Not all types are transformed.
    // These may be primitive types, so they can't be WeakMap keys.
    if (newValue !== value) {
        transformCache.set(value, newValue);
        reverseTransformCache.set(newValue, value);
    }
    return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);

exports.wrap = wrap;
exports.addTraps = addTraps;
exports.instanceOfAny = instanceOfAny;
exports.reverseTransformCache = reverseTransformCache;
exports.unwrap = unwrap;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var __chunk_1 = require('./chunk.js');

/**
 * Open a database.
 *
 * @param name Name of the database.
 * @param version Schema version.
 * @param callbacks Additional callbacks.
 */
function openDB(name, version, { blocked, upgrade, blocking } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = __chunk_1.wrap(request);
    if (upgrade) {
        request.addEventListener('upgradeneeded', (event) => {
            upgrade(__chunk_1.wrap(request.result), event.oldVersion, event.newVersion, __chunk_1.wrap(request.transaction));
        });
    }
    if (blocked)
        request.addEventListener('blocked', () => blocked());
    if (blocking)
        openPromise.then(db => db.addEventListener('versionchange', blocking));
    return openPromise;
}
/**
 * Delete a database.
 *
 * @param name Name of the database.
 */
function deleteDB(name, { blocked } = {}) {
    const request = indexedDB.deleteDatabase(name);
    if (blocked)
        request.addEventListener('blocked', () => blocked());
    return __chunk_1.wrap(request).then(() => undefined);
}

const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
const writeMethods = ['put', 'add', 'delete', 'clear'];
const cachedMethods = new Map();
function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase &&
        !(prop in target) &&
        typeof prop === 'string'))
        return;
    if (cachedMethods.get(prop))
        return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, '');
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
        !(isWrite || readMethods.includes(targetFuncName)))
        return;
    const method = async function (storeName, ...args) {
        const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
        let target = tx.store;
        if (useIndex)
            target = target.index(args.shift());
        const returnVal = target[targetFuncName](...args);
        if (isWrite)
            await tx.done;
        return returnVal;
    };
    cachedMethods.set(prop, method);
    return method;
}
__chunk_1.addTraps(oldTraps => ({
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
}));

exports.unwrap = __chunk_1.unwrap;
exports.wrap = __chunk_1.wrap;
exports.openDB = openDB;
exports.deleteDB = deleteDB;

},{"./chunk.js":1}],3:[function(require,module,exports){
/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  return ([bth[buf[i++]], bth[buf[i++]], 
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]], '-',
	bth[buf[i++]], bth[buf[i++]],
	bth[buf[i++]], bth[buf[i++]],
	bth[buf[i++]], bth[buf[i++]]]).join('');
}

module.exports = bytesToUuid;

},{}],4:[function(require,module,exports){
// Unique ID creation requires a high quality random # generator.  In the
// browser this is a little complicated due to unknown quality of Math.random()
// and inconsistent support for the `crypto` API.  We do the best we can via
// feature-detection

// getRandomValues needs to be invoked in a context where "this" is a Crypto
// implementation. Also, find the complete implementation of crypto on IE11.
var getRandomValues = (typeof(crypto) != 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto)) ||
                      (typeof(msCrypto) != 'undefined' && typeof window.msCrypto.getRandomValues == 'function' && msCrypto.getRandomValues.bind(msCrypto));

if (getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef

  module.exports = function whatwgRNG() {
    getRandomValues(rnds8);
    return rnds8;
  };
} else {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);

  module.exports = function mathRNG() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}

},{}],5:[function(require,module,exports){
var rng = require('./lib/rng');
var bytesToUuid = require('./lib/bytesToUuid');

function v4(options, buf, offset) {
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options === 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || bytesToUuid(rnds);
}

module.exports = v4;

},{"./lib/bytesToUuid":3,"./lib/rng":4}],6:[function(require,module,exports){
"use strict";

var _uploadState = require("./uploadState");

var cacheName = 'site-cache';
var filesToCache = ['/index.js', '/', 'manifest.json'];
var signingURL = 'https://1k0blnxzra.execute-api.ap-southeast-2.amazonaws.com/default/aleph';
self.addEventListener('install', function (e) {
  console.log('[ServiceWorker] Install');
  e.waitUntil(caches.open(cacheName).then(function (cache) {
    console.log('[ServiceWorker] Caching app shell');
    return cache.addAll(filesToCache);
  }));
}); // self.addEventListener('fetch', function(event) {
//   event.respondWith(
//     caches.match(event.request).then(function(response) {
//       return response || fetch(event.request);
//     })
//   );
// });
// self.addEventListener('message', function(event){
//   const {data} = event;
//   const message = JSON.parse(data);
//   console.log("SW Received Message", data);
//   if (message.files == 'added') {
//     queueFiles();
//   }
// });

self.addEventListener('sync', function (event) {
  if (event.tag == 'upload') {
    event.waitUntil(queueFiles());
  }
});

var queueFiles = function queueFiles() {
  return (0, _uploadState.loadFiles)().then(uploadFiles);
};

var uploadFiles = function uploadFiles(files) {
  return files.reduce(function (p, file) {
    return p.then(uploadFile(file));
  }, Promise.resolve());
};

var uploadFile = function uploadFile(file) {
  console.log('checking', file);
  var fileId = file.fileId;
  return (0, _uploadState.lockFile)(fileId).then(function () {
    return console.log('uploading', file);
  }).then(function () {
    return sendToClients({
      uploading: fileDetails(file)
    });
  }).then(signUpload).then(function (signature) {
    return sendFile({
      signature: signature,
      file: file
    });
  }).then(function () {
    return console.log('upload done');
  }).then(function () {
    return (0, _uploadState.deleteFile)(fileId);
  }).catch(function (error) {
    sendToClients({
      error: fileDetails(file)
    });
    throw new Error('uploading file failed', file);
  }).then(function () {
    return sendToClients({
      uploaded: fileDetails(file)
    });
  }).finally(function () {
    return (0, _uploadState.unlockFile)(fileId);
  });
};

var sendFile = function sendFile(_ref) {
  var signature = _ref.signature,
      file = _ref.file;
  var uploadURL = signature.uploadURL;
  console.log('params', {
    uploadURL: uploadURL,
    file: file
  });
  var options = {
    method: 'put',
    mode: 'cors',
    body: file.file
  };
  return fetch(uploadURL, options).then(function (response) {
    if (!response.ok) {
      throw new Error('error in upload');
    }
  });
};

var fileDetails = function fileDetails(_ref2) {
  var fileId = _ref2.fileId,
      file = _ref2.file;
  var name = file.name,
      lastModified = file.lastModified,
      type = file.type,
      size = file.size;
  return {
    fileId: fileId,
    name: name,
    lastModified: lastModified,
    type: type,
    size: size
  };
};

var sendToClients = function sendToClients(msg) {
  clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage(JSON.stringify(msg));
    });
  });
};

var signUpload = function signUpload() {
  return fetch(signingURL, {
    mode: 'cors'
  }).then(function (response) {
    return response.json();
  });
};

},{"./uploadState":7}],7:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deleteFile = exports.unlockFile = exports.lockFile = exports.loadFiles = exports.saveFile = void 0;

var _v = _interopRequireDefault(require("uuid/v4"));

var _idb = require("idb");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var name = "upload-list",
    version = 1;
var uploadList = (0, _idb.openDB)(name, version, {
  upgrade: function upgrade(db, oldVersion, newVersion, transaction) {
    db.createObjectStore("files", {
      keyPath: "fileId"
    });
    db.createObjectStore("uploads", {
      keyPath: "fileId"
    });
  },
  blocked: function blocked() {
    console.error('IDB blocked!');
  },
  blocking: function blocking() {
    console.error('IDB blocking!');
  }
});

var saveFile = function saveFile(file) {
  var fileId = (0, _v.default)();
  return uploadList.then(function (db) {
    return db.add('files', {
      fileId: fileId,
      file: file
    });
  });
};

exports.saveFile = saveFile;

var loadFiles = function loadFiles() {
  return uploadList.then(function (db) {
    return db.getAll('files');
  });
};

exports.loadFiles = loadFiles;

var lockFile = function lockFile(fileId) {
  return uploadList.then(function (db) {
    return db.put('uploads', {
      fileId: fileId
    });
  });
};

exports.lockFile = lockFile;

var unlockFile = function unlockFile(fileId) {
  return uploadList.then(function (db) {
    return db.delete('uploads', fileId);
  });
};

exports.unlockFile = unlockFile;

var deleteFile = function deleteFile(fileId) {
  return uploadList.then(function (db) {
    return db.delete('files', fileId);
  });
};

exports.deleteFile = deleteFile;

},{"idb":2,"uuid/v4":5}]},{},[6]);
