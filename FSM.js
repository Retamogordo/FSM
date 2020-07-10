
	waitPromise = function(interval) { 
		return new Promise( (resolve, _) => {
					 setTimeout( () => { 
					 	resolve( interval ); }, interval );
					} );
	}

	TransitionEntry = function(nextState, transitionCallback, transitionFailureState) {
		this.nextState = nextState;
		this.callback = transitionCallback;
		this.failureState = transitionFailureState;
	}

	State = function(id, description, onCallback) {
		this.id = id;
		this.description = description;
		this.on = onCallback;
		
		this.transitionMap = new Map();
	}

	State.from = function(obj) {
//		let state = new State(obj.id, obj.description, obj.onCallback);
		let state = new State();
		Object.assign(state, obj);

		return state;
	}

	State.prototype.addTransition = function(signalID, transition) {
		this.transitionMap.set(signalID, transition);
		return transition.nextState;
	};

	State.prototype.getTransition = function(sig) {
		return this.transitionMap.get(sig);
	}

	State.prototype.chain = function(signalId, toState, transitionCallback, failureState) {
		this.addTransition(signalId, {nextState: toState, callback: transitionCallback, failureState});
		return toState;
	}

	Signal = function(id, transitionsCallbackArgs) {
		this.id = id;
		this.payload = transitionsCallbackArgs;
	}

	FSM = function() {
		this.idle = new State(-1, "Idle");
		this.awaiting = new State(0, "Running, awaiting signals");

		this.idle.chain(FSM.runFSMSignal.id, this.awaiting);
	
		this.states = new Map();
		this.states.set(this.idle.id, this.idle);
		this.states.set(this.awaiting.id, this.awaiting);

		this.currState = this.idle;
	}

	FSM.runFSMSignal = {id: -1};

	FSM.prototype.onSettle;

	FSM.prototype.init = function( objStates ) {
		let state;

		if (objStates instanceof Array) {
			objStates.forEach( st => {
				st = st instanceof State ? st : State.from(st);
				this.states.set(st.id, st);

				if (st.name) this[st.name] = st;
			} )
		}
		else {
			Object.keys(objStates).forEach( key => {
				state = State.from(objStates[key]);
				this.states.set(state.id, state);
				this[key] = state;
			});
		}
		this.stop();
	}

	const tryCallback = (callback, fsmState) => {
		return (...args) => {
			try {
				callback && callback(...args);
			}
			// do not consume callback exceptions
			finally {
				return fsmState;
			}
		}
	}

	FSM.prototype.stop  = function() {
		this.currState = this.idle;

		tryCallback(this.onIdle, this.idle)(this.idle, "FSM stopped");
	}
	
	FSM.prototype.run = function() {
		this.inputSignal(FSM.runFSMSignal);
	}

	FSM.prototype.inputSignal = function(sig) {

		this.currState = this.changeState(sig, this.currState);
	}


	FSM.prototype.changeState = function(sig, state) {
		let result;
		let transition = state.getTransition(sig.id);

		if ( transition ) {
			try {
				this.onLeave && this.onLeave(state);
			}
			// do not consume callback exceptions
			finally	{
				try	{	
					result = (transition.callback && transition.callback(sig.payload)) || sig.payload;
	//				console.log("result = ", result, "sig.payload: ", sig.payload)
					state = transition.nextState;
				}
				catch (error) {
					result = error;
					console.log("FSM caught: ", error);

					return transition.failureState || state;
				}
				(state.on && tryCallback(state.on, state)(state, result)) ||
			 	(this.onSettle && tryCallback(this.onSettle, state)(state, result)); 
			}
		}
		return state;		
	}

	AsyncFSM = function() {
		FSM.call(this);
		
		this.promise = new Promise((resolve, _) => {
							resolve(this.idle);
						});
	}
	AsyncFSM.prototype = Object.create(FSM.prototype);
	AsyncFSM.prototype.constructor = AsyncFSM;

	AsyncFSM.prototype.stop  = function() {
		this.promise = new Promise((resolve, _) => {
							tryCallback(this.onIdle, this.idle)(this.idle, "FSM stopped");
							
							resolve(this.idle);
						});
	}

	AsyncFSM.prototype.inputSignal = function(sig) {
		this.promise = this.promise.then( state => {return this.changeState(sig, state)} );
	}

	AsyncFSM.prototype.inputSignalDelayed = function(sig, delay) {
		this.promise = this.promise.then( async state => {
			await waitPromise(delay); 
				
			return state;
		})
		.then( state => {return this.changeState(sig, state)} );
	}
//})()
/*
function InternalDataGeneratorFSM(dataGenerationCallback) {
	AsyncFSM.call(this);

//	this.idle.getTransition().transitionCallback
	this.dataGenerationCallback = dataGenerationCallback;

	this.transitionDataFlowGenerator = (f, initialInternalValue) => {
		let data = initialInternalValue;

		console.log("data ", data )
		return (...args) => {
			data = f(data, ...args);
			return data;
		}
	}

	this.transitionCallback = this.transitionDataFlowGenerator(dataGenerationCallback);
}

InternalDataGeneratorFSM.prototype = Object.create(AsyncFSM.prototype);
InternalDataGeneratorFSM.prototype.constructor = InternalDataGeneratorFSM;

InternalDataGeneratorFSM.prototype.run = function(initialInternalValue) {
	this.transitionDataFlowGenerator(undefined, initialInternalValue);	

	AsyncFSM.prototype.run.call(this);
}
*/
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
		newState = state.chain( ShiftRegisterFSM.shiftSignalID, State.from({ id, name: "shiftState" + id}));
		
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

//	this.retrials = retrials;


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


RequestResponseTimeoutPatternFSM.prototype = Object.create(AsyncFSM.prototype);
RequestResponseTimeoutPatternFSM.prototype.constructor = RequestResponseTimeoutPatternFSM;

RequestResponseTimeoutPatternFSM.prototype.onSendRequest;
//RequestResponseTimeoutPatternFSM.prototype.onRetry;
RequestResponseTimeoutPatternFSM.prototype.onResponseReady;
RequestResponseTimeoutPatternFSM.prototype.onResponseFailure;

RequestResponseTimeoutPatternFSM.prototype.genNextRequestTimestamp = function(timestamp) {
		let stamp = new Date().getTime();
//		console.log("genNextRequestTimestamp: ", timestampedRequest)
		return timestamp ? {id: timestamp.id + 1, stamp} : {id: 1, stamp};
};

/*RequestResponseTimeoutPatternFSM.prototype.genNextRequestTimestamp = function(timestampedRequest) {
		let stamp = new Date().getTime();
		console.log("genNextRequestTimestamp: ", timestampedRequest)
		timestampedRequest.timestamp = 
			timestampedRequest.timestamp ? {id: timestampedRequest.timestamp.id + 1, stamp} : {id: 1, stamp};
		return timestampedRequest;
};
*/

RequestResponseTimeoutPatternFSM.startSyncSignalId = 99;
RequestResponseTimeoutPatternFSM.sendRequestSignalId = 100;
RequestResponseTimeoutPatternFSM.timeoutSignalId = 101;
RequestResponseTimeoutPatternFSM.waitForResponseSignalId = 102;
RequestResponseTimeoutPatternFSM.backToListeningSignalId = 103;
RequestResponseTimeoutPatternFSM.responseReadySignalId = 104;
RequestResponseTimeoutPatternFSM.dropResponseSignalId = 105;

RequestResponseTimeoutPatternFSM.prototype.init = function() {

	const consumeResponse = response => {} 
	const validateResponse = (response, timestamp) => { 
		return (response.timestamp.id === timestamp.id && 
			response.timestamp.stamp === timestamp.stamp); 
	}

	
//	const startingRetryRegisterCallback = (state, request) => { 
	const startingRetryRegisterCallback = state => { 

//		request = this.genNextRequestTimestamp(request);
		console.log("Starting Register settled, request: ");

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

		this.retryRegister.run();

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

const receiveResponseDelayed = (response, delay) => {
	setTimeout( 
		() => { 
			console.log("Got simulated response after ", delay, 
				" ms, timestamp: ", response.timestamp.id, "message:", response.message);

			fsm1.receive(response);
			
		}, delay );
}

RequestResponseTimeoutPatternFSM.prototype.send = function(request) {
	this.request = request;

	let sig = {id: RequestResponseTimeoutPatternFSM.startSyncSignalId,}
//				payload: request };

	this.inputSignal(sig);
}

RequestResponseTimeoutPatternFSM.prototype.receive = function(response) {
	this.inputSignal({id: RequestResponseTimeoutPatternFSM.responseReadySignalId,
		payload: response});
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
	console.log("Response consumed by User")
}

fsm1.onResponseFailure = (response) => {
	console.log("No Response available. over")
}


fsm1.init();
fsm1.run();

fsm1.send({description: "My request"});
/*
const receiveDelayed = ( delay) => {
	setTimeout( 
		() => { 
			console.log("Got simulated timeout ", delay, 
				" ms, timestamp: ");
			
		}, delay );
}


const genNextTimestamp = timestamp => {
		try{
		let stamp = new Date().getTime();
		return timestamp ? {id: timestamp.id + 1, stamp} : {id: 1, stamp};
	}
	catch(err){console.log(err)}
	};

let shiftRegister = new ShiftRegisterFSM(4, genNextTimestamp);

shiftRegister.onSettle = (state) => { 
	shiftRegister.shift(undefined, 1000);
	if ( state === shiftRegister.awaiting) return;
	console.log(state.name);
receiveDelayed(2500);
}

shiftRegister.init();
shiftRegister.run();
shiftRegister.stop();
shiftRegister.run();

shiftRegister.shift(undefined, 1000);
receiveDelayed(2500)
shiftRegister.shift(undefined, 1000);

console.log("after all shifts sent")

*/
