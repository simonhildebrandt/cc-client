import uuidv4 from 'uuid/v4';
import { openDB, deleteDB, wrap, unwrap } from 'idb';



const [name, version] = ["upload-list", 1];
const uploadList = openDB(name, version, {
  upgrade(db, oldVersion, newVersion, transaction) {
    db.createObjectStore("files", { keyPath: "fileId" });
    db.createObjectStore("uploads", { keyPath: "fileId" });
  },
  blocked() {
    console.error('IDB blocked!')
  },
  blocking() {
    console.error('IDB blocking!')
  }
});


export const saveFile = file => {
  const fileId = uuidv4();
  return uploadList.then(db => db.add('files', {fileId, file}))
}

export const loadFiles = () => {
  return uploadList.then(db => {
    return db.getAll('files');
  })
}

export const lockFile = fileId => {
  return uploadList.then(db => db.put('uploads', {fileId}))
}

export const unlockFile = fileId => {
  return uploadList.then(db => db.delete('uploads', fileId))
}

export const deleteFile = fileId => {
  return uploadList.then(db => db.delete('files', fileId))
}
