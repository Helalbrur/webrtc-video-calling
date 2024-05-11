const userId = Math.floor(Math.random() * 100000);
const userName = "User-"+Math.floor(Math.random() * 100000);
const userType = "user-type-"+userId;
const password = "x";
document.querySelector('#user-name').innerHTML = 'Current User: '+userName;

const IP ='192.168.0.104';
const PORT = 3000;
// const IP ='103.253.26.18';
// const PORT = 8080;
//if trying it on a phone, use this instead...
// const socket = io.connect('https://LOCAL-DEV-IP-HERE:8181/',{
const socket = io.connect(`https://${IP}:${PORT}/?userName=${userName}&userId=${userId}&password=${password}&userType=${userType}`);

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream; //a var to hold the local video stream
let remoteStream; //a var to hold the remote video stream
let peerConnection; //the peerConnection that the two clients use to talk
let didIOffer = false;

let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

//when a client initiates a call
const call = async e=>{
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //create offer time!
    try{
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer',offer); //send offer to signalingServer
        //await showIncomingCallNotification(offer);
    }catch(err){
        console.log(err)
    }

}

const answerOffer = async(offerObj)=>{
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); //just to make the docs happy
    await peerConnection.setLocalDescription(answer); //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
    console.log(offerObj)
    console.log(answer)
    // console.log(peerConnection.signalingState) //should be have-local-pranswer because CLIENT2 has set its local desc to it's answer (but it won't be)
    //add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer 
    //emit the answer to the signaling server, so it can emit to CLIENT1
    //expect a response from the server with the already existing ICE candidates

    //const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj);
    const offerIceCandidates = await emitWithAckWhenConnected('newAnswer', offerObj);
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log(offerIceCandidates)
}

const addAnswer = async(offerObj)=>{
    //addAnswer is called in socketListeners when an answerResponse is emitted.
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote
    await peerConnection.setRemoteDescription(offerObj.answer)
    // console.log(peerConnection.signalingState)
}

const fetchUserMedia = ()=>{
    return new Promise(async(resolve, reject)=>{
        try{
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            });
            localVideoEl.srcObject = stream;
            localStream = stream;    
            resolve();    
        }catch(err){
            console.log(err);
            reject()
        }
    })
}

const createPeerConnection = (offerObj)=>{
    return new Promise(async(resolve, reject)=>{
        //RTCPeerConnection is the thing that creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            //add localtracks so that they can be sent once the connection is established
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track,remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
            //this won't be set when called from call();
            //will be set when we call from answerOffer()
            // console.log(peerConnection.signalingState) //should be stable because no setDesc has been run yet
            await peerConnection.setRemoteDescription(offerObj.offer)
            // console.log(peerConnection.signalingState) //should be have-remote-offer, because client2 has setRemoteDesc on the offer
        }
        resolve();
    })
}

const addNewIceCandidate = iceCandidate=>{
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}


document.querySelector('#call').addEventListener('click',call);

const emitWithAckWhenConnected = async (eventName, data) => {
    return new Promise((resolve, reject) => {
        if (socket.connected) {
            socket.emit(eventName, data, (response) => {
                resolve(response);
            });
        } else {
            console.error('Socket is not connected.');
            reject('Socket is not connected.');
        }
    });
};

// Function to show incoming call notification
async function showIncomingCallNotification(o) {
    const { value } = await Swal.fire({
        title: `${o.offererUserName}`,
        text: `${o.offererUserName} is calling...`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Accept',
        cancelButtonText: 'Reject'
    });

    if (value) {
        answerOffer(o);
        console.log('Call accepted');
    } else {
        // Handle call rejection
        console.log('Call rejected');
    }
}

// Example: Call the function when a call is received

// Function to display connected users
function displayConnectedUsers(users) {
    const userListEl = document.querySelector('#user-list');
    userListEl.innerHTML = ''; // Clear previous list
    
    users.forEach(user => {
        if(user.userId !==userId)
        {
            const userEl = document.createElement('div');
            userEl.textContent = user.userName;
            userEl.classList.add('user-card'); // Add user-card class

            // Create a button for calling the user
            const callButton = document.createElement('button');
            callButton.textContent = 'Call';
            callButton.classList.add('call-button');
            callButton.addEventListener('click', () => callUser(user));

            userEl.appendChild(callButton);
            userListEl.appendChild(userEl);
        }
    });
}

// Function to call a specific user
async function callUser(user) {
    call()
    // Show incoming call notification
    //await showIncomingCallNotification(user);
    // Initiate call
    // Your call logic here
}


