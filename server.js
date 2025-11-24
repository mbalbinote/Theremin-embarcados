const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = new SerialPort({ path: 'COM5', baudRate: 9600 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));


parser.on('data', (data) => {
    io.emit('sensorData', data);
});

io.on('connection', (socket) => {
    console.log('App conectado: ' + socket.id);
    socket.on('configurarArduino', (novoValor) => {
        console.log('Enviando nova config para Arduino:', novoValor);
        port.write(novoValor.toString());
    });
});


server.listen(3000, '0.0.0.0', () => {
    console.log('Servidor rodando! Conecte o app no IP do seu PC:3000');
});