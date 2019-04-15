import uuidv4 from 'uuid/v4';
import { openDB, deleteDB, wrap, unwrap } from 'idb';



const [name, version] = ["upload-list", 1];
const uploadList = openDB(name, version, {
  upgrade(db, oldVersion, newVersion, transaction) {
    db.createObjectStore("files", { keyPath: "fileId" });
    db.createObjectStore("uploaded_files", { keyPath: "fileId" });
  },
  blocked() {
    console.error('IDB blocked!')
  },
  blocking() {
    console.error('IDB blocking!')
  }
});


export const saveFile = (file, extra = {}) => {
  const fileId = uuidv4();
  return uploadList.then(db => db.add('files', {fileId, extra, file}))
}

export const loadFiles = () => {
  return uploadList.then(db => {
    return db.getAll('files');
  })
}

export const deleteFile = fileId => {
  return uploadList.then(db => db.delete('files', fileId))
}

export const saveUploadedFile = (file, key, extra = {}) => {
  const fileId = uuidv4();
  return uploadList.then(db => db.add('uploaded_files', {fileId, key, extra, file}))
}

export const loadUploadedFiles = () => {
  return uploadList.then(db => {
    return db.getAll('uploaded_files');
  })
}

export const deleteUploadedFile = fileId => {
  return uploadList.then(db => db.delete('uploaded_files', fileId))
}
