import {FSM, AsyncFSM} from "./FSM.js"

function ShiftRegisterFSM(length, transitionCallback, loopBack) {
	AsyncFSM.call(this);
	
	this.length = length;
//	this.transitionDelay = transitionDelay;
	this.transitionCallback = transitionCallback;
	this.loopBack = loopBack;
}

ShiftRegisterFSM.prototype = Object.create(AsyncFSM.prototype);
ShiftRegisterFSM.prototype.constructor = ShiftRegisterFSM;
ShiftRegisterFSM.shiftSignalID = 100;
//ShiftRegisterFSM.resetSignalID = 101;

ShiftRegisterFSM.prototype.init = function () {
	let state = this.awaiting;
//	let firstState;
	let id = 1;
	let newState;
	let length = this.length;
	let transition;

//	this.awaiting.on = () => { this.onReset && this.onReset(); }

	let states = [];
	while (length--) {
		newState = state.chain( ShiftRegisterFSM.shiftSignalID, FSM.State.from({ id, name: "shiftState" + id}));
		
		transition = state.getTransition(ShiftRegisterFSM.shiftSignalID);
//		transition.delay = this.transitionDelay;
		transition.callback = this.transitionCallback;

		state = newState;
		
		++id;

		states.push(state);
	}

	if (this.loopBack) {
		state.chain( ShiftRegisterFSM.shiftSignalID, this.awaiting);
		transition = state.getTransition(ShiftRegisterFSM.shiftSignalID)
//		transition.delay = this.transitionDelay;
		transition.callback = this.transitionCallback;
	} 
	else {
		state.chain( ShiftRegisterFSM.shiftSignalID, state);
		state.on = () => { this.onLastSettle && this.onLastSettle(); }
	}

	FSM.prototype.init.call(this, states);
}

ShiftRegisterFSM.prototype.shift = function(transitionCallbackArgs, delay) {
//	console.log("in shift, ", transitionCallbackArgs.id)

	let sig = {id: ShiftRegisterFSM.shiftSignalID, payload: transitionCallbackArgs};
	
//	console.log("shift signal payload ", sig.payload)
	delay ? this.inputSignalDelayed(sig, delay) : this.inputSignal(sig);
//	this.inputSignal({id: ShiftRegisterFSM.shiftSignalID})
}

function RequestResponseTimeoutPatternFSM(retrials, retrialDelay) {
	AsyncFSM.call(this);

	this.retrialDelay = retrialDelay;

	this.retryRegister = new ShiftRegisterFSM(retrials, this.genNextRequestTimestamp);

	this.retryRegister.onIdle = () => { console.log("shift reg idle"); }

	this.retryRegister.awaiting.on = () => { console.log("shift reg RJNNING"); }

	this.retryRegister.onLastSettle = () => {
		console.log("Last stage settled");

		//	fsm1.inputSignal(sig);
		this.inputSignal( { id: RequestResponseTimeoutPatternFSM.backToListeningSignalId,
		 name: "Giving up => Back To  Waiting for Command" } );
	}

	this.retryRegister.onSettle = (state, timestamp) => {
		console.log("Shift, timestamp: ", timestamp.id, "state:", state.name);

		this.retryRegister.shift(timestamp, this.retrialDelay);
//		this.currTimestamp = timestamp;	
//		console.log(this.currTimestamp)

		this.inputSignal({ id: RequestResponseTimeoutPatternFSM.timeoutSignalId,
				payload: timestamp, name: "Response Timeout"});
	}
}

RequestResponseTimeoutPatternFSM.startSyncSignalId = 99;
RequestResponseTimeoutPatternFSM.sendRequestSignalId = 100;
RequestResponseTimeoutPatternFSM.timeoutSignalId = 101;
RequestResponseTimeoutPatternFSM.waitForResponseSignalId = 102;
RequestResponseTimeoutPatternFSM.backToListeningSignalId = 103;
RequestResponseTimeoutPatternFSM.responseReadySignalId = 104;
RequestResponseTimeoutPatternFSM.dropResponseSignalId = 105;

RequestResponseTimeoutPatternFSM.prototype = (function () {
	let protoObj = Object.create(AsyncFSM.prototype);
	protoObj.constructor = RequestResponseTimeoutPatternFSM;

//	RequestResponseTimeoutPatternFSM.prototype = Object.create(AsyncFSM.prototype);
//	RequestResponseTimeoutPatternFSM.prototype.constructor = RequestResponseTimeoutPatternFSM;

	protoObj.onSendRequest;
	//RequestResponseTimeoutPatternFSM.prototype.onRetry;
	protoObj.onResponseReady;
	protoObj.onResponseFailure;

	protoObj.genNextRequestTimestamp = function(timestamp) {
			let stamp = new Date().getTime();
	//		console.log("genNextRequestTimestamp: ", timestampedRequest)
			return timestamp ? {id: timestamp.id + 1, stamp} : {id: 1, stamp};
	};

	protoObj.init = function() {

		const consumeResponse = response => {} 
		const validateResponse = (response, timestamp) => { 
			return (response.timestamp.id === timestamp.id && 
				response.timestamp.stamp === timestamp.stamp); 
		}

		
	//	const startingRetryRegisterCallback = (state, request) => { 
		const startingRetryRegisterCallback = state => { 

	//		request = this.genNextRequestTimestamp(request);
			console.log("Starting Register settled, request: ");

			this.retryRegister.run();

			let timestamp = this.genNextRequestTimestamp();
			this.retryRegister.shift(timestamp, this.retrialDelay);
			
			let sig = {id: RequestResponseTimeoutPatternFSM.sendRequestSignalId,
	//				payload: request };
					payload: timestamp };

			this.inputSignal(sig);
		}

	//	const sendingRequestCallback = (state, req) => { 
		const sendingRequestCallback = (state, timestamp) => { 
		try {
	//		console.log("Request sent settled, request: ", req);
			console.log("Request sent settled, timestamp: ", timestamp);

			this.request.timestamp = timestamp;

		//	req.timestamp = this.currTimestamp;

			this.inputSignal({id: RequestResponseTimeoutPatternFSM.waitForResponseSignalId, })
	//			payload: req});
	//			payload: timestamp});
		
			this.onSendRequest && this.onSendRequest(this.request);
		}
		catch (err) { console.log(err)}
		}

	//	const waitingForResponseCallback = (state, timestamp) => {
		const waitingForResponseCallback = () => {
	//		this.currentRequest = req;

			console.log("Waiting for response ready settled");
		}

		const responseReadyCallback = (state, response) => { 
			console.log("Response ready settled");

			try {
	//		if (validateResponse(response, this.currTimestamp)) {
			if (validateResponse(response, this.request.timestamp)) {
				console.log("Response valid !!!, timestamp: ", response.timestamp.id)

				this.inputSignal({id: RequestResponseTimeoutPatternFSM.backToListeningSignalId});

				this.onResponseReady && this.onResponseReady(response);
			}
			else {
				this.inputSignal({id: RequestResponseTimeoutPatternFSM.dropResponseSignalId});
				console.log("after drop")

	//			this.onResponseFailure && this.onResponseFailure(response);
			}
			} catch(err) {console.log("err:", err)}
		}

		const backToListeningCallback = () => {
			console.log("Back to listening settled, resetting shift reg.");

			this.retryRegister.stop();

		//	this.retryRegister.run();

	//		this.currTimestamp = this.genNextTimestamp();
		}

		AsyncFSM.prototype.init.call(this, 
			{	
				startingRetryRegister: {id: 1, on: startingRetryRegisterCallback},
				sendingRequest: {id: 2, on: sendingRequestCallback},
				waitingForResponse: {id: 3, on: waitingForResponseCallback},
				responseReady: {id: 4, on: responseReadyCallback},
			} );

		this.awaiting.on = backToListeningCallback;

		this.awaiting
			.chain(RequestResponseTimeoutPatternFSM.startSyncSignalId, this.startingRetryRegister)
			.chain(RequestResponseTimeoutPatternFSM.sendRequestSignalId, this.sendingRequest)
			.chain(RequestResponseTimeoutPatternFSM.waitForResponseSignalId, this.waitingForResponse)
	//		.chain(RequestResponseTimeoutPatternFSM.timeoutSignalId, this.requestSent)	
			.chain(RequestResponseTimeoutPatternFSM.timeoutSignalId, this.sendingRequest)	

		this.waitingForResponse.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

		this.waitingForResponse.chain(RequestResponseTimeoutPatternFSM.responseReadySignalId, this.responseReady)
			.chain(RequestResponseTimeoutPatternFSM.dropResponseSignalId, this.waitingForResponse);

		this.responseReady.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

		this.retryRegister.init();
	}

	protoObj.send = function(request) {
		this.request = request;

		let sig = {id: RequestResponseTimeoutPatternFSM.startSyncSignalId,}
	//				payload: request };

		this.inputSignal(sig);
	}

	protoObj.receive = function(response) {
		this.inputSignal({id: RequestResponseTimeoutPatternFSM.responseReadySignalId,
			payload: response});
	}

    return protoObj;
})();

const receiveResponseDelayed = (response, delay) => {
	setTimeout( 
		() => { 
			console.log("Got simulated response after ", delay, 
				" ms, timestamp: ", response.timestamp.id, "message:", response.message);

			fsm1.receive(response);
			
		}, delay );
}

let fsm1 = new RequestResponseTimeoutPatternFSM(4, 1000);

fsm1.onSendRequest = (req) => { 
	console.log("Sending Request by User");
	receiveResponseDelayed({timestamp: req.timestamp, message: "QQQ"}, 2500); 
}
/*
fsm1.onRetry = (req) => { 
	console.log("Retrying Request");
	receiveResponseDelayed({timestamp: req.timestamp, message: "ZZZ"}, 700);
 }
*/
fsm1.onResponseReady = (response) => {
	console.log("Response: ", response.message, " consumed by User")

	this.send({description: "Another request"});
}

fsm1.onResponseFailure = (response) => {
	console.log("No Response available. over")
}


fsm1.init();
fsm1.run();

fsm1.send({description: "My request"});
