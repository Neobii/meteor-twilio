/**
 * This is where Twilio will POST after someone has recorded their message. 
 */

Router.map(function () {
  this.route('twilioTranscribe', {
  	path: '/twilio/transcribe/',
  	where: 'server',
  	action: function() {

			var query = this.request.query;
			var body = this.request.body; 

      var callInfo = ServerPhoneHelpers.processRequest(this.request);
			var hippoData = callInfo.hippoData;

			var recipient = hippoData.recipient || '0';
      var practice = callInfo.practice;
      
			if(!practice) { return; }

			// first things first -- download from body.RecordingUrl, upload to AWS, 
			// and delete from Twilio.
			CloudStorage.saveFileFromUrl({
				folder: practice._id, 
				url: body.RecordingUrl
			},

      Meteor.bindEnvironment(function(err, data) {  // bind so we can write data
          if(err) { console.log(err); return; }  

        // get the message from here
          var message = '<p><strong>Transcribed text:</strong><br /> ' + body.TranscriptionText + '</p>';
    //    message += '<p><a href="/audio/' + practice._id + '/' + data.filename + '" target="_blank">Original Recording</a><p>';

          var message = {
              type: Enums.CommunicationType.Phone, 
              insensitive: false, 
              body: 'Transcribed text: ' + body.TranscriptionText,
              practice_id: practice._id,
              from: callInfo.fromNum,
              audio: data.filename
          }   

          var conversation = {
              practice_id: practice._id,
              members: [recipient], 
              contacts: [callInfo.fromNum]
          }

          ConversationMethods.createConversation(message,conversation);

          // delete from Twilio
          var twilioCredentials = getPracticeTwilioCredentials(practice._id);

          var twilioSubaccount = Twilio(twilioCredentials.sid, twilioCredentials.authToken);

          twilioSubaccount.recordings(body.RecordingSid).delete();  // audio
          
          // we delete transcriptions manually, as client-library doesn't have this ability.
          Meteor.http.del(
            'https://api.twilio.com/2010-04-01/Accounts/' + twilioCredentials.sid + 
            '/Transcriptions/' + body.TranscriptionSid  + '.json', 
            {
              auth: twilioCredentials.sid + ':' + twilioCredentials.authToken
            }
          );
        }, function(e) {
          console.log(e, 'bind failure');
        }));
			var twilioResponse = new Twilio.TwimlResponse();
      this.response.writeHead(200, {"Content-type": "text/xml"});
      this.response.end(twilioResponse.toString())
		}
	});  
});