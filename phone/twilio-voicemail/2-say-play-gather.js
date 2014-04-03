/**
 * Twilio will call this as the second step after Begin.  This is what will
 * actually say, play, and/or gather.
 */

  Router.map(function () {
  this.route('twilioSayPlayGather', {
  path: '/twilio/say-play-gather',
  where: 'server',
  action: function(){

	  var twilioSayPlayGatherObj = twilioSayPlayGather(this.request);
   	this.response.writeHead(twilioSayPlayGatherObj[0], twilioSayPlayGatherObj[1]);
    this.response.end(twilioSayPlayGatherObj[2]);
	}
	}); 
})

twilioSayPlayGather = function(request) {
	// this is the twilio response object that will generate the TwiML
	var twilioResponse = new Twilio.TwimlResponse(); 

	// Twilio makes the initial call to this url with GET to get TwiML
	// we ignore the next call, POST, with the RecordingURL, as we will wait
	// for /twilio/transcribe to be called
	var query = request.query; 
	var host = request.headers.host;
	var protocol = 'https:';

    if(request.method == 'GET' && query.CallStatus != 'completed') {
		var hippoData = ServerPhoneHelpers.getHippoData(query);
		var phoneCallId = hippoData.phoneCallId;
		var actions = ServerPhoneHelpers.getUserVoicemailActions(query, phoneCallId);
		var curAction = ServerPhoneHelpers.getUserVoicemailActionById(actions, hippoData.actionId);

		if(!curAction) { // no phone number associated with a practice yet
			twilioResponse.say('We are experiencing technical difficulties.  Please try again later.');
			return [200, {'Content-type': 'text/xml'}, twilioResponse.toString()];
		}
		if (!curAction.after) curAction.after = {};

		// assemble callback url 
		var sayPlayGatherUrl = protocol + '//' + request.headers.host + '/twilio/';
		var digitsUrl = protocol + '//' + request.headers.host + '/twilio/digits/';
		
		//record the route for future action
		if (curAction.id != 'enterPhone' && curAction.id != 'enterPhoneAgain') hippoData.previousRoute = curAction.id;
		if (hippoData.previousRoute == 'businessHours') hippoData.skipDialingClient = true;

		var digitsUrlWithHippoData = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, digitsUrl);
		

		/*
		'PostRouteActions':
		{
			'ReplayMessage' : 0,
			'RouteCall': 1,
			'GetCallerNumber':2,
			'RecordMessage' : 3,
			'Disconnect' : 4
		}*/

		var afterActionType = curAction.after.type || Enums.PostRouteActions.ReplayMessage;
		var delay = curAction.after.delay != undefined ? curAction.after.delay : 5;
		var timeoutAction = curAction.after.action_id != undefined ? curAction.after.action_id : curAction.id; 
		var delegate = curAction.after.delegate || '0'; 
		var gatheringNumbers = (curAction.actions.length > 0 || afterActionType == Enums.PostRouteActions.GetCallerNumber);
		
		if(gatheringNumbers) {  // gather & say
			
			var gatherParams = {
				action: digitsUrlWithHippoData, 
				method: 'GET', 
				numDigits: 1, 
				timeout: delay  
			}

			if (afterActionType == Enums.PostRouteActions.GetCallerNumber) { // this is a special one, where we can enter any number of numbers
				timeoutAction = curAction.id;
				delete gatherParams.numDigits; 
				gatherParams.timeout = 15;

				gatherParams.finishOnKey = '#';

				curAction.text = curAction.text.replace('#', 'pound');  // say "pound" instead of "hash" 
			}

			twilioResponse.gather(gatherParams, function() {
				sayOrPlay(this, curAction);
			});
		} else if(curAction) { // just say
			sayOrPlay(twilioResponse, curAction);
		}

		if (!gatheringNumbers && delay > 0)
		{
			twilioResponse.pause({length:delay});
		}

		// check if it's a voicemail action -- if so, add a gather after the say/play
		if(afterActionType == Enums.PostRouteActions.RecordMessage) {
			
			hippoData.recipient = delegate;
			
			// assemble transcribe callback Url
			var transcribeUrl = protocol + '//' + host + '/twilio/transcribe/';

			var transcribeHippoData = ServerPhoneHelpers.copyHippoData(hippoData);
			transcribeHippoData.actionId = 'transcribe';

			var transcribeUrlWithHippoData = ServerPhoneHelpers.attachHippoDataToUrl(transcribeHippoData, transcribeUrl);

			twilioResponse.record({
				maxLength: 120,  // 2 minutes
				transcribe: true,
				transcribeCallback: transcribeUrlWithHippoData,
				playBeep: true
			});
		} else 
		{
			// This will handle the timeout callback action.
			// (seems weird to redo if-calls, but these need to be done sequentially)

			// there's something after timeout, but let's process it with another GET request to this method
			if(timeoutAction && afterActionType != Enums.PostRouteActions.Disconnect) {
				var timeoutHippoData = ServerPhoneHelpers.copyHippoData(hippoData);
				timeoutHippoData.actionId = timeoutAction;
				timeoutHippoData.skipDialingClient = true;

				var timeoutUrl = ServerPhoneHelpers.attachHippoDataToUrl(timeoutHippoData, sayPlayGatherUrl);

				twilioResponse.redirect({
					method: 'GET'
				}, timeoutUrl);
			}
			
		}
    }
    
    return [200, {
    	'Content-type': 'text/xml'
    }, twilioResponse.toString()];
}

/**
 * This will either Say or Play depending on the type of the action passed in
 */
function sayOrPlay(twilioResponse, action) {
	if(action.type == 'say') {
		twilioResponse.say({
			voice: 'alice', 
			language: 'en-GB'
		}, action.text);

	} else {
		twilioResponse.play(action.audio);
	}
}