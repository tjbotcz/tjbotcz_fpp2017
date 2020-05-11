//IoT Platform
var iotf = require("ibmiotf");
var config = require("./device.json");

//TJBot libs
var TJBot = require("./lib/tjbotlib_prague");
var conf = require("./config");
var fs = require("fs"); //filesystem

//TODO Delete pigpio requirement - moved into lib
//Pigpio library for LED
//var gpio = require("pigpio").Gpio;


//REST API
var express    = require('express');
var bodyParser = require('body-parser');

//picture marker
var PImage = require('pureimage');

//async calls
var asyncCall = require('async');



//TJBot as the IoT device
//---------------------------------------------------------------------
var tjiot = new iotf.IotfDevice(config);
tjiot.log.setLevel('debug');
tjiot.connect();

//TJBot - Watson services
//---------------------------------------------------------------------
var credentials = conf.credentials;
var hardware = ['microphone', 'speaker', 'servo', 'camera', 'rgb_led'];
var tjConfig = conf.tjConfig;
var _paths = conf.paths;

var tj = new TJBot(hardware, tjConfig, credentials);

//Context object
var contextBackup; // last conversation context backup
var ctx; // our internal context object

//IoT - CONNECTED
//---------------------------------------------------------------------
tjiot.on('connect', function(){
  console.log("TJBot connected to IoT Platform");
  tjiot.publish('connected', 'json', '{"type":"connect"}', 2);
});

//IoT - RECONNECTED
//---------------------------------------------------------------------
tjiot.on('reconnect', function(){
  console.log("TJBot reconnected to IoT Platform");
  tjiot.publish('connected', 'json', '{"type":"reconnect"}', 2);
});

//IoT - DISCONNECTED
//---------------------------------------------------------------------
tjiot.on('disconnect', function(){
  console.log('Disconnected from IoT Platform');
});

//IoT - ERROR
//---------------------------------------------------------------------
tjiot.on("error", function (err) {
  console.log("Error: " + err);
});

//IoT - COMMANDS
//---------------------------------------------------------------------
tjiot.on("command", function (cmd, format, payload, topic) {
  var payloadObject = JSON.parse(payload);
  processAction(cmd, payloadObject);
  postProcessAction(cmd, payloadObject);
});

//REST API & chat client
//---------------------------------------------------------------------
function initRestAPI(){
  var restAPI = express();
  restAPI.use(bodyParser.urlencoded({ extended: true }));
  restAPI.use(bodyParser.json());

  var port = 80;
  var router = express.Router();

  router.get('/', function(req, res) {
  	res.json({ message: 'Hello, this is TJBot\'s REST API!' });
  });

  router.route('/converse')
  	.get(function(req, res) {
  		res.json({ "error": 'Use [POST] instead!' });
  	})
  	.post(function(req, res) {
  		if (req.body.message){
  			console.log("[REST API] message: " + req.body.message);

        processConversation(req.body.message, function(response){
          res.json({ message: response.description });
          //read response text from the service
          tj.speak(response.description).then(function(){
            if (response.object.context.hasOwnProperty('action')){
              var cmdType = response.object.context.action.cmdType;
              var cmdPayload;
              if (response.object.context.action.hasOwnProperty('cmdPayload')) {
                cmdPayload = response.object.context.action.cmdPayload;
              }
              processAction(cmdType, cmdPayload);
            }
	  });
        });
  		} else {
  			var err = "[REST API] 'message' block is missing in the POST payload";
  			console.error(err);
  			res.json({ "error": err });
  		}
  	});

  restAPI.use('/rest', router);
  restAPI.use(express.static(__dirname + '/public'));

  restAPI.listen(port);
  console.log('RestAPI is active on port ' + port);
}

//---------------------------------------------------------------------
// Functions
//---------------------------------------------------------------------

//VISUAL RECOGNITION
//---------------------------------------------------------------------
function take_a_photo(){
  return new Promise(function(resolve, reject) {
    tj.takePhoto(_paths.picture.orig).then(function(data) {
      if (!fs.existsSync(_paths.picture.orig)) {
        reject("expected picture.jpg to have been created");
      } else {
        resolve("picture taken successfully");
      }
    });
    tj.play(_paths.music.take_a_picture);
  });
}

function classify_photo(){
  tj.recognizeObjectsInPhoto(_paths.picture.orig).then(function(objects){
      console.log(JSON.stringify(objects, null, 2));
      //update ctx
      ctx.see = {
        "objects" : objects
      }; updateCtx();
      photoClassificationToText(objects, function(text){
          tj.speak(text);
      });
  });
}

function photoClassificationToText(objects, callback){
      var text = "";
      var numOfClasses = 0;
      var maxNumOfClasses = 5;
      objects.sort(function(a,b){return b.score - a.score;});
      for( var j = 0; j < objects.length; j++){
          if(objects[j].score >= 0.5){
	    if (numOfClasses) text =  text + ',';
            text = text + " " + objects[j].class;
            numOfClasses++;
            if(numOfClasses >=  maxNumOfClasses) break;
          }

      }
      if (text != "") {
        text = "I think I can see: " + text + ".";
      } else {
        text = "I can't recognize what is in the picture.";
      }
  callback(text);
}

function read_text(){
  tj.recognizeTextInPhoto(_paths.picture.orig).then(function(texts){
      console.log(JSON.stringify(texts, null, 2));

      if(texts.images[0].hasOwnProperty('text') && texts.images[0].text !== ""){
        //update ctx
        ctx.see = {
          "text" : texts.images[0].text
        }; updateCtx();
        tj.speak("I think I can see following words: " + texts.images[0].text);
      } else {
        //update ctx
        ctx.see = {
          "text" : ""
        }; updateCtx();
        tj.speak("I can't see any text.");
      }
      if(texts.images[0].hasOwnProperty('words')){
        markWords(texts.images[0].words).then(function(response){
          if (response) console.log("[markWords]: " + response);
        }).catch(function(error){
          if (error) console.log("[markWords]: " + error);
        });
      }
  });
}

/*
@words - words object from recognizeTextInPhoto Watson service
*/
function markWords(words){
  return new Promise(function(resolve, reject) {
    if (!Array.isArray(words) || words.length == 0) reject("Object is not an array or words' length is 0");
    console.log("Marking words...");
    PImage.decodeJPEGFromStream(fs.createReadStream(_paths.picture.orig)).then((img)=>{
      var c = img.getContext('2d');
      var fontSize = 22;
      c.strokeStyle = "red";
      c.fillStyle = 'red';
      c.font = fontSize + "pt 'Source Sans Pro'";
      c.lineWidth = 4;
      c.imageSmoothingEnabled = true;

      var fnt = PImage.registerFont(_paths.font.sanse_pro,'Source Sans Pro');
      fnt.load(function() {
        words.forEach(function myFunction(word, idx) {
          var _left = word.location.left;
          var _top = word.location.top;
          var _width = word.location.width;
          var _height = word.location.height;

          var _word = word.word;

          //draw rect
          c.beginPath();
          c.moveTo(_left,_top);
          c.lineTo(_left+_width,_top);
          c.lineTo(_left+_width,_top+_height);
          c.lineTo(_left,_top+_height);
          c.lineTo(_left,_top);
          c.stroke();

          //draw caption
          c.fillText(_word, _left, _top-10);

          console.log("Word '" + _word + "' was marked.");
        });

        PImage.encodeJPEGToStream(img,fs.createWriteStream(_paths.picture.edit)).then(()=> {
            resolve("Marking words... done.");
        });
      });
    });

  });
}

function detect_faces(){
  tj.detectFacesInPhoto(_paths.picture.orig).then(function(faces){
    console.log(JSON.stringify(faces, null, 2));
    //update ctx
    ctx.see = {
      "faces" : faces.images[0].faces
    }; updateCtx();
    markFaces(faces).then(function(response){
      if (response) console.log("[markFaces]: " + response);
    }).catch(function(error){
      if (error) console.log("[markFaces]: " + error);
    });
    detectFacesToText(faces, function(text){
      tj.speak(text);
    });
  });
}

function detectFacesToText(faces, callback){
  if(faces){
    if (faces.images[0].faces.length !== 0 ){
      var text = "";
      faces.images[0].faces.forEach(function myFunction(face, idx) {
        var gender = face.gender.gender;
        var age_min = face.age.min;
        var age_max = face.age.max;
        var name = null;
        if (face.hasOwnProperty('identity')){
          name = face.identity.name;
        }
        var ageInfo = "between " + age_min + " and " + age_max + ". ";
        if (age_min === undefined) {
          ageInfo = "under " + age_max + ". ";
        }
        if (age_max === undefined) {
          ageInfo = "over " + age_min + ". ";
        }
        if (idx == 0){
          text = text + "I think I can see a " + gender + " whose age is " + ageInfo;
          if (name !== null) text += "I also recognized the identity. It should be " + name + ". ";
        } else {
          text = text + "And a " + gender + " whose age is " + ageInfo;
          if (name !== null) text += "I also recognized the identity. It should be " + name + ". ";
        }
      });
      console.log(text);
    } else {
      text = "I can't see anybody.";
    }
  }
  callback(text);
}

/*
@faces - faces object from detectFaces Watson service
*/
function markFaces(faces){
  var faces = faces.images[0].faces;

  return new Promise(function(resolve, reject) {
    if (!Array.isArray(faces) || faces.length == 0) reject("Object is not an array or faces' length is 0");
    console.log("Marking faces...");
    PImage.decodeJPEGFromStream(fs.createReadStream(_paths.picture.orig)).then((img)=>{
      var c = img.getContext('2d');
      var fontSize = 22;
      c.strokeStyle = "red";
      c.fillStyle = 'red';
      c.font = fontSize + "pt 'Source Sans Pro'";
      c.lineWidth = 4;
      c.imageSmoothingEnabled = true;

      var fnt = PImage.registerFont(_paths.font.sanse_pro,'Source Sans Pro');
      fnt.load(function() {
        faces.forEach(function myFunction(face, idx) {
          var _left = face.face_location.left;
          var _top = face.face_location.top;
          var _width = face.face_location.width;
          var _height = face.face_location.height;

          var _gender = face.gender.gender;

          var _age_min = face.age.min;
          var _age_max = face.age.max;

          //draw rect
          c.beginPath();
          c.moveTo(_left,_top);
          c.lineTo(_left+_width,_top);
          c.lineTo(_left+_width,_top+_height);
          c.lineTo(_left,_top+_height);
          c.lineTo(_left,_top);
          c.stroke();

          //draw caption
          var ageInfo = "age " + _age_min + "-" + _age_max;
          if (_age_min === undefined) {
            ageInfo = "age under " + _age_max;
          }
          if (_age_max === undefined) {
            ageInfo = "age over " + _age_min;
          }
          c.fillText("[" + idx + "]: " + _gender + ", " + ageInfo, _left, _top-10);

          //draw identity if known
          if (face.hasOwnProperty('identity')){
            c.fillStyle = 'blue';
            c.fillText(face.identity.name, _left+5, _top + fontSize + 5);
            c.fillStyle = 'red';
          }

          console.log("Face with idx=" + idx + " was marked.");
        });

        PImage.encodeJPEGToStream(img,fs.createWriteStream(_paths.picture.edit)).then(()=> {
            resolve("Marking faces... done.");
        });
      });
    });

  });
}

//CONVERSATION
//---------------------------------------------------------------------
function listen(){
  ctx.listening = 1; updateCtx();
  tj.speak("Hello, my name is " + tj.configuration.robot.name + ". I am listening...");

  tj.listen(function(msg) {
      // check to see if they are talking to TJBot
      if(msg.indexOf(tj.configuration.robot.name) > -1) { //robot's name is in the text

      //if (msg.startsWith(tj.configuration.robot.name)) {
        // remove our name from the message
        var msgNoName = msg.toLowerCase().replace(tj.configuration.robot.name.toLowerCase(), "");

        processConversation(msgNoName, function(response){
          //read response text from the service
          tj.speak(response.description).then(function(){
            if (response.object.context.hasOwnProperty('action')){
              var cmdType = response.object.context.action.cmdType;
              var cmdPayload;
              if (response.object.context.action.hasOwnProperty('cmdPayload')) {
                cmdPayload = response.object.context.action.cmdPayload;
              }
              processAction(cmdType, cmdPayload);
            }
          });
        });
      }
  });
}

function processConversation(inTextMessage, callback){
  if(contextBackup == null) contextBackup = ctx;
  if(contextBackup.hasOwnProperty('action')) delete contextBackup.action;
  Object.assign(contextBackup, ctx);
  // send to the conversation service
  tj.converse(conf.conversationWorkspaceId, inTextMessage, contextBackup, function(response) {
      console.log(JSON.stringify(response, null, 2));
      contextBackup = response.object.context;
      callback(response);
  });

}

function processAction(cmd, payload) {
  switch(cmd){
    case "tjbot_reset":
      resetTJBot();
      break;
    case "take_a_photo":
      take_a_photo().then(function(){
        tj.speak("I am done. You can classify objects, detect faces or find a text now.");
      });
      break;
    case "classify_photo":
      classify_photo();
      break;
    case "read_text":
      read_text();
      break;
    case "detect_faces":
      detect_faces();
      break;
    case "photo_and_detect_faces":
      take_a_photo().then(function(){
        //this must be called in this way otherwise it takes a previous picture
        detect_faces();
      });

      break;
    case "listen":
      listen();
      break;
    // case "pause_listening":
    //   pauseListening();
    //   break;
    // case "resume_listening":
    //   resumeListening();
    //   break;
    case "stop_listening":
      stopListening();
      break;
    case "led_turn_on":
      led_turn_on_all();
      break;
    case "led_turn_off":
      led_turn_off_all();
      break;
    case "led_change_color":
      led_change_color(payload.color);
      break;
    case "pulse_on":
      pulse_on();
      break;
    case "pulse_off":
      pulse_off();
      break;
    case "wave_arm":
      wave_arm(payload.position);
      break;
    case "house_open_door":
      house_open_door();
      break;
    case "house_close_door":
      house_close_door();
      break;
    case "house_change_led_color":
      house_change_led_color(payload.color);
      break;
    case "house_led_turn_off":
      house_led_turn_off();
      break;
    case "house_led_turn_on":
      house_led_turn_on();
      break;
    case "house_reset":
      house_reset();
      break;
    case "update_house_data":
      update_house_data(payload);
      break;
    default:
      console.log("Command not supported... " + cmd);
  }
}

function postProcessAction(cmd, payload) {
  switch(cmd){
    case "tjbot_reset":
      break;
    case "take_a_photo":
      break;
    case "classify_photo":
      break;
    case "read_text":
      break;
    case "detect_faces":
      break;
    case "photo_and_detect_faces":
      break;
    case "listen":
      break;
    // case "pause_listening":
    //   pauseListening();
    //   break;
    // case "resume_listening":
    //   resumeListening();
    //   break;
    case "stop_listening":
      break;
    case "led_turn_on":
      break;
    case "led_turn_off":
      break;
    case "led_change_color":
      break;
    case "pulse_on":
      break;
    case "pulse_off":
      break;
    case "wave_arm":
      break;
    case "house_open_door":
      break;
    case "house_close_door":
      break;
    case "house_change_led_color":
      break;
    case "house_led_turn_off":
      break;
    case "house_led_turn_on":
      break;
    case "house_reset":
      break;
    case "update_house_data":
      break;
    default:
      console.log("PostAction not supported... " + cmd);
  }
}

//if tj.pauseListening() is called and works then after few
//minutes the internat error occures and tjbot must be restarted
//to be able to listen again
//@deprecated
// function pauseListening(){
//   if(context.listening == 1) {
//     tj.pauseListening();    //DOES NOT WORK with tj.speak() immediatelly after it (probably)!!!!
//     context.listening = 2;
//
//     var msg = "Listening was paused.";
//     tj.speak(msg);
//     console.log(msg);
//   } else {
//     console.log("tjbot is not listenning...");
//   }
// }

// function resumeListening() {
//   if(context.listening == 2) {
//     tj.resumeListening();
//     context.listening = 1;
//
//     var msg = "Listening was resumed.";
//     tj.speak(msg);
//     console.log(msg);
//   } else {
//     console.log("tjbot is not paused...");
//   }
// }

function stopListening(){
  tj.stopListening();

  var msg = "Listening was stopped.";
  tj.speak(msg).then(function(){
    ctx.listening = 0; updateCtx();
  });
  console.log(msg);
}

//LED
//---------------------------------------------------------------------

//Turns off all the LED colors
//---------------------------------------------------------------------
function led_turn_off_all() {
  ctx.ledOn = 0; updateCtx();
  if (ctx.ledPulsing) pulse_off();

  tj.turnOffRGBLed();
}

//Turns on all the LED on random color
//---------------------------------------------------------------------
function led_turn_on_all() {
  tj.turnOnRGBLed(function(color){
    if(color){
    ctx.ledColor = color; ctx.ledOn = 1; updateCtx();
    } else{
      concolse.log("Led did not turn on.");
    }
  });
}

//Changes the color of th RGB diode
//---------------------------------------------------------------------
function led_change_color(color){
  tj.changeColorRGBLed(color, function(ret_color){
    if(ret_color) console.log(ret_color);
    else console.log("Color did not set.");
  });
  ctx.ledColor = color; ctx.ledOn = 1; updateCtx();
}

//PULSE ON
//---------------------------------------------------------------------
function pulse_on(){
//  if (ctx.ledPulsing) return; // otherwise we would start several pulses...
//  if (!ctx.ledOn) return; //we have no color to pulse...tj.pulseOnRGBLed(ctx);
  tj.pulseOnRGBLed(ctx, function(ret){
console.log("PULSE:"+ret);
    if(ret){
      ctx.ledPulsing = 1;
       updateCtx();
    }
  });
//
//  dutyCycle = 0;
//  pulseTimer = setInterval(function () {
//    var color = ctx.ledColor;
//    if (color == "red" || color == "yellow" || color == "magenta" || color == "white") ledR.pwmWrite(dutyCycle);
//    if (color == "green" || color == "yellow" || color == "cyan" || color == "white") ledG.pwmWrite(dutyCycle);
//    if (color == "blue" || color == "magenta" || color == "cyan" || color == "white") ledB.pwmWrite(dutyCycle);
//
//    dutyCycle += 5;
//    if (dutyCycle > 255) {
//      dutyCycle = 0;
//    }
//  }, 20);
}

//PULSE OFF
//---------------------------------------------------------------------
function pulse_off(){
  ctx.ledPulsing = 0; updateCtx();
//  clearInterval(pulseTimer);
  tj.pulseOffRGBLed();
}

//ARM
//---------------------------------------------------------------------
function wave_arm(position){
console.log("CMD: " + position);
  switch(position){
   case "back":
     tj.armBack();
     break;
   case "raised":
     tj.raiseArm();
     break;
   case "forward":
     tj.lowerArm();
     break;
   case "wave":
     tj.wave();
     position = "raised";
     break;
   default:
     tj.speak("I'm not able to set my arm into this position.");
  }
  ctx.armPosition = position; updateCtx();
}

//HOUSE
//---------------------------------------------------------------------
function house_open_door(){
  var cmd = {
    "cmdType" : "house_open_door"
  };
  tjiot.publish('cmd-house', 'json', cmd, 2);
}

function house_close_door(){
  var cmd = {
    "cmdType" : "house_close_door"
  };
  tjiot.publish('cmd-house', 'json', cmd, 2);
}

function house_change_led_color(color){
  var cmd = {
    "cmdType" : "house_change_led_color",
    "color": color
  };
  tjiot.publish('cmd-house', 'json', cmd, 2);
}

function house_led_turn_off(){
  var cmd = {
    "cmdType" : "house_led_turn_off"
  };
  tjiot.publish('cmd-house', 'json', cmd, 2);
}

function house_led_turn_on(){
  house_change_led_color("random");
}

function house_reset(){
  var cmd = {
    "cmdType" : "house_reset"
  };
  tjiot.publish('cmd-house', 'json', cmd, 2);
}

function update_house_data(houseData){
  Object.assign(ctx, houseData);
  //updateCtx(); data gets already updated on the server!!!
}
//RESET TJBOT
//---------------------------------------------------------------------
function resetTJBot(){

  ctx = {
    "robotName": tj.configuration.robot.name,
    "listening":1, //1-listening, 0-stopped (2-paused is no longer applicable)
    "ledOn": 0,
    "ledColor": "no color",
    "ledPulsing": 0,
    "armPosition": "raised", //back, raised, forward
    "myLocation": "Prague",
    "houseLedOn": 0,
    "houseLedColor": "no color",
    "houseTemperature": -1,
    "houseHumidity": -1,
    "houseHeatIndex": -1,
    "houseDoorState": "closed", //closed, opened
    "timezone": "Europe/Prague",
    "see": {
      //options are:
        // "faces": {...}   OR
        // "text" : "..."   OR
        // "objects" : {...}
    }
  }

  tj.raiseArm();
  pulse_off();
  led_turn_off_all();
  tj.stopListening();
  listen();
 //updateCtx(); does not need to be here since all the previous functions do update
}

//@Deprecated - not effective!!! manual update instead
//Context observer
// function initContextObserver(){
//   var WatchJS = require("melanke-watchjs");
//   var watch = WatchJS.watch;
//
//   watch(ctx, function(){
//     tjiot.publish('status', 'json', ctx, 2);
//   });
// }
function updateCtx(){
  tjiot.publish('status', 'json', ctx, 0);
}

//CALL INIT
//---------------------------------------------------------------------
resetTJBot();
house_reset();
initRestAPI();
