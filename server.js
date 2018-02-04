import express from 'express';
import favicon from 'serve-favicon';
import {MongoClient, ObjectID} from 'mongodb';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import http from 'http';

import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import {StaticRouter} from 'react-router';

var legacyPort = 8080;
const socket = process.env.socket || '/run/node/node.sock';

global.window = {
  addEventListener: () => {},
  scrollTo: () => {}
};
global.document = {
  addEventListener: () => {}
};

var AppComponent = require('./src/App').default;

/* GZIP everything */
function sendBase(req, res, next) {
  fs.readFile(__dirname + '/../public/index.html', 'utf8', function (error, docData) {
    if (error) throw error;
    res.writeHead(200, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});
    const AppElement = ReactDOMServer.renderToString(
                        <StaticRouter location={req.url} context={{}}>
                          <AppComponent/>
                        </StaticRouter>
                      );
    const document = docData.replace(/<div id="app"><\/div>/,`<div id="app">${AppElement}</div>`);
    zlib.gzip(document, function (_, result) {
      res.end(result);
    });
  });
}

const app = express();
const server = http.createServer(app);

// Reverse proxy to django site
const httpProxy = require('http-proxy');
const apiProxy = httpProxy.createProxyServer({
  target: 'https://www.csua.berkeley.edu:8080',
  changeOrigin: true,
});
const proxyCall = (req, res) => apiProxy.web(req, res);
app.all("/media/*", proxyCall);
app.all("/api/*", proxyCall);
app.all("/~*", proxyCall);

app.all('*', function(req, res, next){
  if (req.path.startsWith('/newuser') || req.path.startsWith('/computers')) {
    res.redirect('https://' + req.hostname + ':' + legacyPort + req.path);
    return;
  }
  next();
});

app.use(favicon(path.join(__dirname, '/../public/static/images/logos/favicon.ico')));

app.get('/bundle.js', function (req, res, next) {
  req.url = req.url + '.gz';
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'application/javascript');
  next();
});

app.get('/bundle.css', function (req, res, next) {
  req.url = req.url + '.gz';
  res.set('Content-Encoding', 'gzip');
  res.set('Content-Type', 'text/css');
  next();
});

app.get('/', sendBase);

app.use(express.static('./public'));

app.get('*', sendBase);

server.listen(
  socket, () => console.log('Node/express test server listening on ' + socket)
);

server.on('listening', function() { return fs.chmod(socket, '0777') });
server.on('error', function(e) {
  if (e.code !== 'EADDRINUSE') throw e;
  fs.unlinkSync(socket);
  server.listen(socket, () => console.log('Socket ' + socket + ' in use, attempting unlink'));
});
