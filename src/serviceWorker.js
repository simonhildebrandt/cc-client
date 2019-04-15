import "@babel/polyfill";

import { loadFiles, deleteFile, saveUploadedFile } from './uploadState';
import URL from 'url-parse';


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
    console.log('attempting sync')
    event.waitUntil(queueFiles());
  }
});

const queueFiles = () => {
  return loadFiles().then(uploadFiles)
}

const uploadFiles = files => {
  return files.reduce((p, file) => p.then(uploadFile(file)), Promise.resolve());
}

async function uploadFile(record) {
  const { fileId, file, extra } = record;
  const { name, lastModified, type, size } = file;
  const fileDetails = { name, lastModified, type, size };

  await sendToClients({action: 'uploading', fileId, fileDetails, extra})

  try {
    const {status, json} = await signUpload(fileDetails);
    if (status == 422) {
      await sendToClients({action: 'invalid', fileId, fileDetails, extra});
      await deleteFile(fileId);
      return;
    }
    const {uploadURL, key} = json;
    await sendFile({uploadURL, file});
    await deleteFile(fileId);
    await saveUploadedFile(file, key, extra);
    await sendToClients({action: 'uploaded', fileId, fileDetails, key, extra});
  } catch(err) {
    await sendToClients({action: 'error', fileId, fileDetails, extra});
    console.log(err)
    throw new Error('uploading file failed', file);
  }
}

const sendFile = ({uploadURL, file}) => {
  const options = { method: 'put', mode: 'cors', body: file }

  return fetch(uploadURL, options)
  .then(response => {
    if (!response.ok) {
      response.text().then(body => console.log('upload error!', body))
      throw new Error('error in upload')
    };
  })
}

const sendToClients = msg => {
  return clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(JSON.stringify(msg));
    })
  })
}
const signUpload = file => {
  const url = new URL(signingURL, true);
  url.set('query', file)
  console.log(file, url, url.href)
  return fetch(url, {mode: 'cors'}).then(response => ({status: response.status, json: response.json()}))
}
