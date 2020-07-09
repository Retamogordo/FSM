//(function () {
	waitPromise = function(interval) { 
		return new Promise( (resolve, _) => {
					 setTimeout( () => { resolve( interval ); }, interval );
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
	try {
		return this.transitionMap.get(sig);
			}
	catch(err) {console.log(err)}
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
		console.log("FSM")
		this.idle = new State(-1, "Idle");
		this.awaiting = new State(0, "Running, awaiting signals");

		this.idle.chain(FSM.prototype.runFSMSignal.id, this.awaiting);
	
		this.states = new Map();
		this.states.set(this.idle.id, this.idle);
		this.states.set(this.awaiting.id, this.awaiting);

		this.promise = new Promise((resolve, reject) => {
							resolve(this.idle);
						});
	}

	FSM.prototype.runFSMSignal = {id: -1};

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
		this.promise = this.promise.then( (_) => { 
			return tryCallback(this.onIdle, this.idle)(this.idle, "FSM stopped");
		})
	}

	FSM.prototype.run = function() {
		this.inputSignal(FSM.prototype.runFSMSignal);
	}

	FSM.prototype.inputSignal = function(sig) {
		let result;
		let transition;

//		console.log("signal:", sig)

		this.promise = this.promise.then( async state => {
			
//			console.log("state: ", state)
			transition = state.getTransition(sig.id);

//			console.log("transition: ", transition)
			
			if ( transition ) {
				try {
					this.onLeave && this.onLeave(state);
				}
				// do not consume callback exceptions
				finally	{
					try	{	
						transition.delay &&	await waitPromise(transition.delay);

//						console.log("after transition.delay")
						result = (transition.callback && transition.callback(sig.payload)) || sig.payload;
//						console.log("transition.nextState==", transition.nextState)

						return transition.nextState;
					}
					catch (error) {
						result = error;
						console.log("FSM caught: ", error);

						return transition.failureState || state;
					}
				}
			}
			return state;		
		})
		.then( state => { 
//			console.log("IN FSM ", state)
			 transition && 
						( (state.on && tryCallback(state.on, state)(state, result)) ||
						 (this.onSettle && tryCallback(this.onSettle, state)(state, result)) ); 
			return state;
		});
//		.then( state => {  this.onSettle(state, result); return state; });		
	}
//})()
function ShiftRegisterFSM(length, transitionDelay, transitionCallback, loopBack) {
	console.log("in ShiftRegisterFSM")
	FSM.call(this);

	this.length = length;
	this.transitionDelay = transitionDelay;
	this.transitionCallback = transitionCallback;
	this.loopBack = loopBack;
}

ShiftRegisterFSM.prototype = Object.create(FSM.prototype);
ShiftRegisterFSM.prototype.constructor = ShiftRegisterFSM;
ShiftRegisterFSM.shiftSignalID = 100;
ShiftRegisterFSM.resetSignalID = 101;

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
		transition.delay = this.transitionDelay;
		transition.callback = this.transitionCallback;

		state = newState;
		
		++id;

		states.push(state);
	}

	if (this.loopBack) {
		state.chain( ShiftRegisterFSM.shiftSignalID, this.awaiting);
		transition = state.getTransition(ShiftRegisterFSM.shiftSignalID)
		transition.delay = this.transitionDelay;
		transition.callback = this.transitionCallback;
	} 
	else {
		state.chain( ShiftRegisterFSM.shiftSignalID, state);
		state.on = () => { this.onLastSettle && this.onLastSettle(); }
	}

	FSM.prototype.init.call(this, states);
}

ShiftRegisterFSM.prototype.shift = function(transitionCallbackArgs) {
	this.inputSignal({id: ShiftRegisterFSM.shiftSignalID, payload: transitionCallbackArgs})
}

//ShiftRegisterFSM.prototype.reset = function(transitionCallbackArgs) {
//	this.inputSignal({id: ShiftRegisterFSM.resetSignalID, payload: transitionCallbackArgs})
//}

function TimeStampGenShiftRegisterFSM(length, transitionDelay) {
	function genNextTimestamp() {
		let timestamp; 
		return () => {
			console.log("TIME STAMP: ", timestamp);
			let stamp = new Date().getTime();
			timestamp = timestamp ? {id: timestamp.id + 1, stamp} : {id: 1, stamp};
			return timestamp;
		}
	}

	const n = genNextTimestamp();

	ShiftRegisterFSM.call(this, length, transitionDelay, n);
}

TimeStampGenShiftRegisterFSM.prototype = Object.create(ShiftRegisterFSM.prototype);
TimeStampGenShiftRegisterFSM.prototype.constructor = TimeStampGenShiftRegisterFSM;

function RequestResponseTimeoutPatternFSM() {
	FSM.call(this);

//	this.retrials = retrials;

	this.genNextTimestamp = timestamp => {
		let stamp = new Date().getTime();
		return timestamp ? {id: timestamp.id + 1, stamp} : {id: 1, stamp};
	};
}

RequestResponseTimeoutPatternFSM.prototype = Object.create(FSM.prototype);
RequestResponseTimeoutPatternFSM.prototype.constructor = RequestResponseTimeoutPatternFSM;

RequestResponseTimeoutPatternFSM.prototype.onRequestSent;
//RequestResponseTimeoutPatternFSM.prototype.onRetry;
RequestResponseTimeoutPatternFSM.prototype.onResponseReady;
RequestResponseTimeoutPatternFSM.prototype.onResponseFailure;

RequestResponseTimeoutPatternFSM.makeRequestSignalId = 99;
RequestResponseTimeoutPatternFSM.sendRequestSignalId = 100;
RequestResponseTimeoutPatternFSM.timeoutSignalId = 101;
RequestResponseTimeoutPatternFSM.waitForRequestSignalId = 102;
RequestResponseTimeoutPatternFSM.backToListeningSignalId = 103;
RequestResponseTimeoutPatternFSM.responseReadySignalId = 104;
RequestResponseTimeoutPatternFSM.dropResponseSignalId = 105;

RequestResponseTimeoutPatternFSM.prototype.init = function() {

	const consumeResponse = response => {} 
	const validateResponse = (response, timestamp) => { 
		return (response.timestamp.id === timestamp.id && 
			response.timestamp.stamp === timestamp.stamp); 
	}

	const requestReadyToSendCallback = (state, req) => {
		console.log("Request ready to send settled, request.timestamp: ", req);

		this.retryRegister.run();
		this.currTimestamp = this.genNextTimestamp();
		this.retryRegister.shift(this.currTimestamp);

		req.timestamp = this.currTimestamp;
		
		this.inputSignal({id: RequestResponseTimeoutPatternFSM.sendRequestSignalId, payload: req});
	}

	const requestSentCallback = (state, req) => { 
	try {
		console.log("Request sent settled, request.timestamp: ", req.timestamp.id);
	//	this.currTimestamp = req.timestamp;

		this.inputSignal({id: RequestResponseTimeoutPatternFSM.waitForRequestSignalId, payload: req.timestamp});

		let retrial = req.timestamp.id;
		this.onRequestSent && this.onRequestSent(req, retrial);
	}catch (err) { console.log(err)}
	}

	const waitingForResponseCallback = (state, timestamp) => {
		console.log("Waiting for response ready settled, timestamp: ", timestamp.id);
	}

	const responseReadyCallback = (state, response) => { 
		console.log("Response ready settled");

		try {
		if (validateResponse(response, this.currTimestamp)) {
			console.log("Response valid !!!, timestamp: ", response.timestamp.id)

			this.inputSignal({id: RequestResponseTimeoutPatternFSM.backToListeningSignalId});

			this.onResponseReady && this.onResponseReady(response);
		}
		else {
			this.inputSignal({id: RequestResponseTimeoutPatternFSM.dropResponseSignalId});
			console.log("after drop")

			this.onResponseFailure && this.onResponseFailure(response);
		}
		} catch(err) {console.log(err)}
	}

	const backToListeningCallback = () => {
		console.log("Back to listening settled, stopping shift reg.");

	//	shiftRegFSM.reset();
		this.retryRegister.stop();
	}

	FSM.prototype.init.call(this, 
		{	requestReadyToSend: {id: 1, on: requestReadyToSendCallback},
			requestSent: {id: 2, on: requestSentCallback},
			waitingForRequest: {id: 3, on: waitingForResponseCallback},
			responseReady: {id: 4, on: responseReadyCallback},
		} );

	this.awaiting.on = backToListeningCallback;

	this.awaiting.chain(RequestResponseTimeoutPatternFSM.makeRequestSignalId, this.requestReadyToSend)
		.chain(RequestResponseTimeoutPatternFSM.sendRequestSignalId, this.requestSent)
		.chain(RequestResponseTimeoutPatternFSM.waitForRequestSignalId, this.waitingForRequest)
//		.chain(RequestResponseTimeoutPatternFSM.timeoutSignalId, this.requestSent)	
		.chain(RequestResponseTimeoutPatternFSM.timeoutSignalId, this.makeRequestSignalId)	

	this.waitingForRequest.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

	this.waitingForRequest.chain(RequestResponseTimeoutPatternFSM.responseReadySignalId, this.responseReady)
		.chain(RequestResponseTimeoutPatternFSM.dropResponseSignalId, this.waitingForRequest);

	this.responseReady.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

//	this.retryRegister.init();
}

RequestResponseTimeoutPatternFSM.prototype.send = function(request, retrials, retrialDelay) {
	this.retryRegister = new ShiftRegisterFSM(retrials, retrialDelay, this.genNextTimestamp);
//	this.retryRegister = new TimeStampGenShiftRegisterFSM(retrials, retrialDelay);

	this.retryRegister.onIdle = () => { console.log("shift reg stopped"); }

	//shiftRegFSM.onReset = () => { console.log("Shift reg. reset")}
	this.retryRegister.onLastSettle = () => {
		console.log("Last stage settled");

		//	fsm1.inputSignal(sig);
		this.inputSignal( { id: RequestResponseTimeoutPatternFSM.backToListeningSignalId,
		 name: "Giving up => Back To  Waiting for Command" } );
	}

	this.retryRegister.onSettle = (state, timestamp) => {
		console.log("Shift, timestamp: ", timestamp.id, "state:", state.name);

		this.retryRegister.shift(timestamp);
		this.currTimestamp = timestamp;

//		this.retryRegister.shift();
			
		this.inputSignal({ id: RequestResponseTimeoutPatternFSM.timeoutSignalId,
				payload: timestamp, name: "Response Timeout"});

		console.log("Shift, new timestamp: ", timestamp.id, " passing " + "Response Timeout"+ " command");
	//	currTimestamp = getNextTimestamp(timestamp);
	}

	this.retryRegister.init();

	let sig = {id: RequestResponseTimeoutPatternFSM.makeRequestSignalId,
				payload: request };

	this.inputSignal(sig);
}

RequestResponseTimeoutPatternFSM.prototype.receive = function(response) {
	this.inputSignal({id: RequestResponseTimeoutPatternFSM.responseReadySignalId,
		payload: response});
}

const receiveResponseDelayed = (response, delay) => {
	setTimeout( 
		() => { 
			console.log("Got simulated response after ", delay, 
				" ms, timestamp: ", response.timestamp.id, "message:", response.message);

			fsm1.receive(response);
			
		}, delay );
}
const simulateResponse = timestamp => { return { timestamp, responseDescr: "qwertz"} }

let fsm1 = new RequestResponseTimeoutPatternFSM();

fsm1.onRequestSent = (req, retrial) => { 
	console.log("Sending Request by User");
	receiveResponseDelayed({timestamp: req.timestamp, message: "QQQ"}, 500); 
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

//fsm1.send({description: "My request"}, 4, 1500);

let tfsm = new TimeStampGenShiftRegisterFSM(2, 100);
tfsm.onSettle = (state, result) => {console.log("result=", result)}
tfsm.init();
tfsm.run();
tfsm.shift();
tfsm.shift();


