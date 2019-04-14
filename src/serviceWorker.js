import { loadFiles, lockFile, unlockFile, deleteFile } from './uploadState';

const cacheName = 'site-cache';
const filesToCache = [
  '/index.js',
  '/',
  'manifest.json',
];
const signingURL = 'https://1k0blnxzra.execute-api.ap-southeast-2.amazonaws.com/default/aleph';



self.addEventListener('install', function(e) {
  console.log('[ServiceWorker] Install');
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(filesToCache);
    })
  );
});

// self.addEventListener('fetch', function(event) {
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


self.addEventListener('sync', function(event) {
  if (event.tag == 'upload') {
    event.waitUntil(queueFiles());
  }
});

const queueFiles = () => {
  return loadFiles().then(uploadFiles)
}

const uploadFiles = files => {
  return files.reduce((p, file) => p.then(uploadFile(file)), Promise.resolve());
}

const uploadFile = file => {
  console.log('checking', file)
  const {fileId} = file;

  return lockFile(fileId)
    .then(() => console.log('uploading', file))
    .then(() => sendToClients({uploading: fileDetails(file)}))
    .then(signUpload)
    .then(signature => sendFile({signature, file}))
    .then(() => console.log('upload done'))
    .then(() => deleteFile(fileId))
    .catch(error => {
      sendToClients({error: fileDetails(file)});
      throw new Error('uploading file failed', file);
    })
    .then(() => sendToClients({uploaded: fileDetails(file)}))
    .finally(() => unlockFile(fileId))
}

const sendFile = ({signature, file}) => {
  const {uploadURL} = signature;
  console.log('params', {uploadURL, file})
  const options = { method: 'put', mode: 'cors', body: file.file }

  return fetch(uploadURL, options)
  .then(response => {
    if (!response.ok) { throw new Error('error in upload')}
  })
}

const fileDetails = ({fileId, file}) => {
  const { name, lastModified, type, size } = file
  return {fileId, name, lastModified, type, size }
}

const sendToClients = msg => {
  clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(JSON.stringify(msg));
    })
  })
}
const signUpload = () => {
  return fetch(signingURL, {mode: 'cors'}).then(response => response.json())
}
