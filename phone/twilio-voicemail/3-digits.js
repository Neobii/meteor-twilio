/**
 * This will be called when the user presses a number as a response
 */
Router.map(function () {
  this.route('twilioDigits', {
  path: '/twilio/digits',
  where: 'server',
  action: function(){
		var twilioDigitsObj = twilioDigits(this.request);
   	this.response.writeHead(twilioDigitsObj[0], twilioDigitsObj[1]);
    this.response.end(twilioDigitsObj[2]);
	}
	});
});  

twilioDigits = function(request) {
	// this is the twilio response object that will generate the TwiML
	var twilioResponse = new Twilio.TwimlResponse(); 

	var query = request.query;

	var host = request.headers.host;
    var protocol = /*request.headers.host.indexOf('hippoverse.com') > -1 ?*/ 'https:';// : 'http:';

	if(request.method == 'GET' && query.CallStatus != 'completed') {
		var hippoData = ServerPhoneHelpers.getHippoData(query);



		var phoneCallId = hippoData.phoneCallId;

		var actions = ServerPhoneHelpers.getUserVoicemailActions(query, phoneCallId);
		var curAction = ServerPhoneHelpers.getUserVoicemailActionById(actions, hippoData.actionId);

		if(!curAction) { // no phone number associated with a practice yet
			twilioResponse.say('We are experiencing technical difficulties.  Please try again later.');
			return [200, {'Content-type': 'text/xml'}, twilioResponse.toString()];
		}

		// assemble callback url
		var twilioBaseCallbackUrl = protocol + '//' + request.headers.host + '/twilio/';
		var twilioCallbackUrl = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, twilioBaseCallbackUrl);

		// based on query.Digits, determine what action to call.
		var chosenActionId = ServerPhoneHelpers.getChosenActionId(query.Digits, curAction);
		if (curAction.after.type == Enums.PostRouteActions.GetCallerNumber && query.Digits.length > 0) 
		{
			if (Helpers.validatePhone(query.Digits))
			{
				chosenActionId = curAction.after.action_id;
				hippoData.alternatePhone = query.Digits;
			}
			else
			{
				chosenActionId = "enterPhoneAgain";
				//play error message, regather
			}
		} 
		if (chosenActionId == "previousRoute")
		{
			if (hippoData.previousRoute) chosenActionId = hippoData.previousRoute;
			else chosenActionId = null;
		} 

		if(!chosenActionId) { // redirect back to original
			var retryUrl = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, twilioBaseCallbackUrl);

			twilioResponse.redirect({
				method: 'GET'
			}, retryUrl);
		} else {  // redirect to the actionId
			hippoData.actionId = chosenActionId;
			hippoData.digits = query.Digits;
			var redirectUrl = ServerPhoneHelpers.attachHippoDataToUrl(hippoData, twilioBaseCallbackUrl);

			twilioResponse.redirect({
				method: 'GET'
			}, redirectUrl); 
		}
	}

	return [200, {
		'Content-type': 'text/xml'
	}, twilioResponse.toString()];
}