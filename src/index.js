import "@babel/polyfill";

import React, {useState, useEffect} from 'react';
import ReactDOM from 'react-dom';
import { saveFile, loadUploadedFiles, deleteUploadedFile } from './uploadState';
import { config } from './firebaseConfig';
import firebase from 'firebase/app';
import firestore from 'firebase/firestore';
import 'firebase/auth';
import * as firebaseui from 'firebaseui';

firebase.initializeApp(config);
const db = firebase.firestore();

const authUI = new firebaseui.auth.AuthUI(firebase.auth());

const uiConfig = {
  signInSuccessUrl: 'http://localhost:9000',
  signInFlow: 'popup',
  signInOptions: [
    firebase.auth.GoogleAuthProvider.PROVIDER_ID
  ]
};

let myUser;
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    myUser = user;
  } else {
    myUser = null;
  }
  console.log({myUser})
});

authUI.start('#firebaseui-auth-container', uiConfig);


const makeIterable = dumb => {
  const arr = [];
  for (var i = 0; i < dumb.length; i++) {
    arr.push(dumb[i]);
  }
  return arr;
}

const changed = (e) => {
  const {files} = e.target;

  Promise.all(makeIterable(files).map((file => saveFile(file, {clock: 1}))))
  .then(() => {
    navigator.serviceWorker.ready.then(reg => {
      return reg.sync.register('upload');
    });
  })
}

navigator.serviceWorker.addEventListener('message', listenForMessage);

async function listenForMessage(event) {
  const {data} = event;
  console.log("Client Received Message: " + event.data);

  const {action, fileId, key, extra} = JSON.parse(data);
  if (action == 'uploaded') {
    await checkForNewUploadedFilesWhenVisible();
  }
}

async function checkForNewUploadedFilesWhenVisible() {
  if (!document.hidden) {
    const newFiles = await loadUploadedFiles();
    return Promise.all(
      newFiles.map(({key, fileId, extras}) => {
        return saveFileToUser(key, extras)
          .then(() => deleteUploadedFile(fileId));
      })
    )
  }
}

document.addEventListener('visibilitychange', checkForNewUploadedFilesWhenVisible)

function saveFileToUser(key, extras={}) {
  return db.collection("images").add({
    ...extras,
    key,
    createdAt: new Date(),
    createdBy: myUser.uid
  });
}

// function sendMessageToSw(msg){
//   if (navigator.serviceWorker.controller) {
//     navigator.serviceWorker.controller.postMessage(JSON.stringify(msg));
//   } else {
//     console.log('missing', navigator.serviceWorker)
//   }
// }
//

const docs = snapshot => snapshot.docs.reduce((hash, doc) => {
  hash[doc.id] = doc.data();
  return hash;
}, {});

const imagePath = path => `https://clock-camera-development.s3.ap-southeast-2.amazonaws.com/${path}`

const Form = () => {
  const [images, setImages] = useState({});

  useEffect(() => {
    const unsub = db.collection('images').onSnapshot(snapshot => {
      setImages(docs(snapshot));
    });
    return () => unsub();
  }, [])

  return <div>
    <input onChange={changed} multiple type="file"/>
    <button>Test</button>
    <div>
      {Object.values(images).map(image =>
        <div key={image.key}><a href={imagePath(image.key)}><img style={{height: 100}} src={imagePath(image.key)}/>{image.key}</a></div>
      )}
    </div>
  </div>
}

ReactDOM.render(<Form/>, document.getElementById('app'));


if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js');
  });
}


    // result.then(r => {
    //   cache.match(fileId).then(response => {
    //     response.arrayBuffer().then(d => console.log(d))
    //   });
    // })
    // .catch((error) => console.log({error}))


    //  signUpload()
    //
    //       const options = {
    //         method: 'put',
    //         mode: 'cors',
    //         body: files[0]
    //       }
    //
    //       fetch(uploadURL, options)
    //         .then(response => {
    //           console.log(response)
    //           response.text().then(x => console.log(x))
    //         })
    //         .catch((error) => console.log({error}))
    //
    //     })


// https://read.acloud.guru/how-to-add-file-upload-features-to-your-website-with-aws-lambda-and-s3-48bbe9b83eaa
