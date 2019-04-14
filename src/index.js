import "@babel/polyfill";

import React from 'react';
import ReactDOM from 'react-dom';
import { saveFile } from './uploadState';


const makeIterable = dumb => {
  const arr = [];
  for (var i = 0; i < dumb.length; i++) {
    arr.push(dumb[i]);
  }
  return arr;
}

const changed = (e) => {
  const {files} = e.target;

  Promise.all(makeIterable(files).map(saveFile))
  .then(() => {
    navigator.serviceWorker.ready.then(reg => {
      return reg.sync.register('upload');
    });
  })
}

navigator.serviceWorker.addEventListener('message', function(event){
  console.log("Client Received Message: " + event.data);
});

// function sendMessageToSw(msg){
//   if (navigator.serviceWorker.controller) {
//     navigator.serviceWorker.controller.postMessage(JSON.stringify(msg));
//   } else {
//     console.log('missing', navigator.serviceWorker)
//   }
// }
//


const Form = () => {
  return <div>
    <input onChange={changed} multiple type="file"/>
    <button>Test</button>
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
