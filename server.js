var socket = require('socket.io');
var express = require('express');
var https = require('https');
var cors = require('cors');
var bodyParser = require('body-parser');
const fs = require('fs');

var app = express();
// Enable trust proxy setting
app.set('trust proxy', true);
app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// var server = http.createServer(app);

var server = https.createServer(app);
var io = socket.listen(server);
require('events').EventEmitter.prototype._maxListeners = 100;
app.use(express.static(__dirname));


server.listen(3000,'192.168.0.104', () => {
  console.log(`server start at https://192.168.0.104:3000`);
});


//offers will contain {}
const offers = [
  // offererUserName
  // offer
  // offerIceCandidates
  // answererUserName
  // answer
  // answererIceCandidates
];
const connectedSockets = [
  //username, socketId,userId,
]

io.on('connection',(socket)=>{
  // console.log("Someone has connected");
  const userName = socket.handshake.query.userName;
  const password = socket.handshake.query.password;
  const userId = socket.handshake.query.userId;
  const userType = socket.handshake.query.userType;

  if(password !== "x"){
      socket.disconnect(true);
      return;
  }
  connectedSockets.push({
      socketId: socket.id,
      userName:userName,
      userId:userId,
      userType:userType,
  });

  io.emit('connectedUsers', connectedSockets.filter(user => user.socketId !== socket.id));

  //a new client has joined. If there are any offers available,
  //emit them out
  if(offers.length){
      socket.emit('availableOffers',offers);
  }
  
  socket.on('newOffer',newOffer=>{
      offers.push({
          offererUserName: userName,
          offer: newOffer,
          offerIceCandidates: [],
          answererUserName: null,
          answer: null,
          answererIceCandidates: []
      })
      // console.log(newOffer.sdp.slice(50))
      //send out to all connected sockets EXCEPT the caller
      socket.broadcast.emit('newOfferAwaiting',offers.slice(-1))
  })

  socket.on('newAnswer',(offerObj,ackFunction)=>{
      console.log(offerObj);
      //emit this answer (offerObj) back to CLIENT1
      //in order to do that, we need CLIENT1's socketid
      const socketToAnswer = connectedSockets.find(s=>s.userName === offerObj.offererUserName)
      if(!socketToAnswer){
          console.log("No matching socket")
          return;
      }
      //we found the matching socket, so we can emit to it!
      const socketIdToAnswer = socketToAnswer.socketId;
      //we find the offer to update so we can emit it
      const offerToUpdate = offers.find(o=>o.offererUserName === offerObj.offererUserName)
      if(!offerToUpdate){
          console.log("No OfferToUpdate")
          return;
      }
      //send back to the answerer all the iceCandidates we have already collected
      ackFunction(offerToUpdate.offerIceCandidates);
      offerToUpdate.answer = offerObj.answer
      offerToUpdate.answererUserName = userName
      //socket has a .to() which allows emiting to a "room"
      //every socket has it's own room
      socket.to(socketIdToAnswer).emit('answerResponse',offerToUpdate)
  });

  socket.on('sendIceCandidateToSignalingServer',iceCandidateObj=>{
      const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
      console.log('didIOffer=',didIOffer);
      console.log('iceUserName=',iceUserName);
      // console.log(iceCandidate);
      if(didIOffer){
          //this ice is coming from the offerer. Send to the answerer
          const offerInOffers = offers.find(o=>o.offererUserName === iceUserName);
          if(offerInOffers){
              offerInOffers.offerIceCandidates.push(iceCandidate)
              // 1. When the answerer answers, all existing ice candidates are sent
              // 2. Any candidates that come in after the offer has been answered, will be passed through
              if(offerInOffers.answererUserName){
                  //pass it through to the other socket
                  const socketToSendTo = connectedSockets.find(s=>s.userName === offerInOffers.answererUserName);
                  if(socketToSendTo){
                      socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
                  }else{
                      console.log("Ice candidate recieved but could not find answere")
                  }
              }
          }
      }else{
          //this ice is coming from the answerer. Send to the offerer
          //pass it through to the other socket
          const offerInOffers = offers.find(o=>o.answererUserName === iceUserName);
          //const socketToSendTo = connectedSockets.find(s=>s.userName === offerInOffers.offererUserName);
          const socketToSendTo = offerInOffers && offerInOffers.offererUserName ? connectedSockets.find(s => s.userName === offerInOffers.offererUserName) : null;

          if(socketToSendTo){
              socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer',iceCandidate)
          }else{
              console.log("Ice candidate recieved but could not find offerer")
          }
      }
      // console.log(offers)
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove the disconnected user from the active user list
      const index = connectedSockets.findIndex(user => user.socketId === socket.id);
      if (index !== -1) {
        connectedSockets.splice(index, 1);
        io.emit('connectedUsers', connectedSockets.filter(user => user.socketId !== socket.id));
      }
  });

});