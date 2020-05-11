/*
User-specific configuration
    ** IMPORTANT NOTE ********************
    * Please ensure you do not interchange your username and password.
    * Hint: Your username is the lengthy value ~ 36 digits including a hyphen
    * Hint: Your password is the smaller value ~ 12 characters
*/

exports.conversationWorkspaceId = ''; // replace with the workspace identifier of your conversation

// Create the credentials object for export
exports.credentials = {};

// Watson Conversation
// https://www.ibm.com/watson/developercloud/conversation.html
exports.credentials.conversation = {
	password: '',
	username: ''
};

// Watson Speech to Text
// https://www.ibm.com/watson/developercloud/speech-to-text.html
exports.credentials.speech_to_text = {
	password: '',
	username: ''
};

// Watson Text to Speech
// https://www.ibm.com/watson/developercloud/text-to-speech.html
exports.credentials.text_to_speech = {
	password: '',
	username: ''
};

// Watson Visual Recognition
// https://www.ibm.com/watson/developercloud/visual-recognition.html
exports.credentials.visual_recognition = {
	api_key: '',
        version: '',
        version_date: ''
};


//Default configuration of TJBot
//!!!be careful with the configration of speakerDeviceId!!!
exports.tjConfig = {
	log: {
			level: 'info' // valid levels are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
	},
	robot: {
			gender: 'male', // see TJBot.prototype.genders
			                //if gender is female and speak.voice is undefined it can be a problem (first phrase is spoken by male voice)
			name: 'Watson'
	},
	listen: {
			microphoneDeviceId: "plughw:1,0", // plugged-in USB card 1, device 0; see arecord -l for a list of recording devices
			inactivityTimeout: -1, // -1 to never timeout or break the connection. Set this to a value in seconds e.g 120 to end connection after 120 seconds of silence
			language: 'en-US', // see TJBot.prototype.languages.listen
			customization_id: '' //customization model id for STT
	},
	wave: {
			servoPin: 7 // corresponds to BCM 7 / physical PIN 26
	},
	speak: {
			language: 'en-US', // see TJBot.prototype.languages.speak
			voice: undefined, // use a specific voice; if undefined, a voice is chosen based on robot.gender and speak.language
					  // english voices: en-US_MichaelVoice, en-US_AllisonVoice, en-US_LisaVoice, en-GB_KateVoice
			speakerDeviceId: "plughw:0,0" // plugged-in USB card 1, device 0; see aplay -l for a list of playback devices
			//speakerDeviceId: "bluealsa:HCI=hci0,DEV=XX:XX:XX:XX:XX:XX,PROFILE=a2dp" // bluetooth speaker, set mac adress from "cat ~/.asoundrc" device
	},
	see: {
			confidenceThreshold: {
					object: 0.5,
					text: 0.1
			},
			camera: {
					height: 720,
					width: 960,
					vflip: false, // flips the image vertically, may need to set to 'true' if the camera is installed upside-down
					hflip: false // flips the image horizontally, should not need to be overridden
			},
	}
}

//IBM TJBot Prague enhancement
exports.paths = {
	picture: {
		orig: __dirname + '/public/img/picture.jpg',
		edit: __dirname + '/public/img/picture_edit.jpg'
	},
	music: {
		take_a_picture: __dirname + '/media/music/take_a_picture.wav'
	},
	font: {
		sanse_pro: __dirname + '/fonts/SourceSansPro-Regular.ttf'
	}
}
