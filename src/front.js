import socket from 'socket.io-client';
import { Auth } from 'auth0tter';
import React from 'react';
import ReactDOM from 'react-dom';
import GridList from '@material-ui/core/GridList';
import GridListTile from '@material-ui/core/GridListTile';
import GridListTileBar from '@material-ui/core/GridListTileBar';
import IconButton from '@material-ui/core/IconButton';
import InfoIcon from '@material-ui/icons/Info';
import { withStyles } from '@material-ui/core/styles';


const styles = theme => ({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    overflow: 'hidden',
    backgroundColor: theme.palette.background.paper,
  },
  gridList: {
    width: 500,
    height: 450,
  },
  icon: {
    color: 'rgba(255, 255, 255, 0.54)',
  },
});


const noop = () => {}

class Client {
  constructor(auth) {
    this.auth = auth;

    this.socket = socket('ws://localhost:1979');
    this.socket.on('connect', function(){
      console.log('connected!', this.socket)
    });
    this.socket.on('message', function(data){
      console.log('message!', data)
    });
    this.socket.on('error', (data) => {
      console.log(data)
       switch (data.type) {
        case 'missing_auth':
          console.error("Huh? we failed to send auth?")
          break;
        case 'invalid_auth':
          console.log('time to log in again')
          this.auth.logout();
          break;
        default:
          console.error('unrecognised error from server', data)
      }
    });
    this.socket.on('close', function(){
      console.log('close!', this.socket)
    });
    this.socket.on('reconnect', () => {
      console.log('reconnect!', this.socket)
      this.notify(null, (x) => {console.log('arguments', x)});
    });
  }

  notify(message = {}, callback=noop) {
    console.log('sending', message)
    this.socket.emit('data', {...message, auth: this.auth.token}, callback)
  }
}

const auth = window.auth = new Auth({
  domain: 'clockcamera.au.auth0.com',
  clientID: 'Rc2vG1XNsWaQQDOQgzJ31DrUqAFxNool',
  redirectUri: 'http://localhost:9000/index.html',
  audience: 'CCServerDev', //https://clockcamera.au.auth0.com/userinfo',
  responseType: 'token id_token',
  scope: 'openid'
})

var button = document.getElementById('login')
const client = window.client = new Client(auth)

window.boot = function() {
  button.addEventListener('click', (event) => {
    if (window.auth.gotToken) {
      window.auth.logout()
    } else {
      window.auth.login()
    }
  })

  if (window.auth.gotToken) {
    button.innerHTML = 'logout'
  } else {
    button.innerHTML = 'login'
  }

  window.auth.on('authenticated', () => {
    button.innerHTML = 'logout'
    client.notify()
  })

  window.auth.on('deauthenticated', () => {
    button.innerHTML = 'login'
  })

  if (window.auth.gotToken){
    client.notify()
  }
}

window.conclude = function() {
  console.log('concluding')
  window.auth.conclude()
}

const Comp = ({classes}) => <GridList>
  { [1,2,3,4].map(k =>
    <GridListTile key={k.toString()}>
      <img src="/godlike.jpg" />
      <GridListTileBar
        title={k * 1010}
        subtitle={<span>size: {k*100}kb</span>}
        actionIcon={
          <IconButton className={classes.icon}>
            <InfoIcon />
          </IconButton>
        }
      />
    </GridListTile>
  )}
</GridList>

const Grid = withStyles(styles)(Comp);
ReactDOM.render(<Grid/>, document.getElementById('app'));
