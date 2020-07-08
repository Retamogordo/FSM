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

//		firstState = firstState || newState;
		
//		newState.chain( ShiftRegisterFSM.resetSignalID, this.awaiting); // reset

		state = newState;
		
		++id;

		states.push(state);
	}

//	if (firstState && this.loopBack) {
	if (this.loopBack) {
//		state.chain( ShiftRegisterFSM.shiftSignalID, firstState);
		state.chain( ShiftRegisterFSM.shiftSignalID, this.awaiting);
		transition = state.getTransition(ShiftRegisterFSM.shiftSignalID)
		transition.delay = this.transitionDelay;
		transition.callback = this.transitionCallback;

//		state.chain( ShiftRegisterFSM.resetSignalID, shiftRegFSM.awaiting);
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



prepareRequest = token => { 
	let req = {token, description: "My request"}

	return req;
}

const requestReadyToSendCallback = (state, req) => {
	console.log("Request ready to send settled, request.token: ", req.token.id);

	shiftRegFSM.run();
	shiftRegFSM.shift(req.token);
//	shiftRegFSM.shift(currToken);
	
	fsm1.inputSignal({id: 100, payload: req});
}

const requestSentCallback = (state, req) => { 
try {
	console.log("Request sent settled, request.token: ", req.token.id);
	currToken = req.token;

	fsm1.inputSignal({id: 102, payload: req.token});

}catch (err) { console.log(err)}
}

const waitingForRequestCallback = (state, token) => {
	console.log("Waiting for response ready settled, token: ", token.id);

	sendRequestThenReceiveResponseDelayed(token, 2400);
}

const responseReadyCallback = (state, response) => { 
	console.log("Response ready settled");

	try {
	if (validateResponse(response, currToken)) {
		console.log("Response valid !!!, token: ", response.token.id)

//		shiftRegFSM.reset();

		fsm1.inputSignal(backToListeningSignal);

		consumeResponse(response);
	}
	else {
		console.log("Response timed out, keep trying")

		fsm1.inputSignal(dropResponseSignal);
		console.log("after drop")
	}
	} catch(err) {console.log(err)}
}

const backToListeningCallback = () => {
	console.log("Back to listening settled, stopping shift reg.");

//	shiftRegFSM.reset();
	shiftRegFSM.stop();
}

const consumeResponse = response => {} 
const validateResponse = (response, token) => { 
	return response.token.id === token.id; 
} 

const genNextToken = token => {return token ? {id: token.id + 1} : {id: 1} }; 

//let maxShifts = 5;
//currShift = 0;
//currToken = undefined;

let shiftRegFSM = new ShiftRegisterFSM(3, 1000, genNextToken);
shiftRegFSM.onIdle = () => { console.log("shift reg stopped"); }

//shiftRegFSM.onReset = () => { console.log("Shift reg. reset")}
shiftRegFSM.onLastSettle = () => {
	console.log("Last stage settled");

	//	fsm1.inputSignal(sig);
	fsm1.inputSignal( { id: 103, name: "Giving up => Back To  Waiting for Command" } );
}

shiftRegFSM.onSettle = (state, token) => {
	console.log("Shift, token: ", token.id, "state:", state.name);

	let sig;
try {
//	if( ++currShift < maxShifts ) {
		sig =  { id: 101, name: "Response Timeout"};
	
		shiftRegFSM.shift(token);
		
		sig.payload = prepareRequest(token);
//		fsm1.inputSignal(sig);
//	}
//	else {
//		shiftRegFSM.reset();

//		sig = { id: 103, name: "Giving up => Back To  Waiting for Command" }
//	}
//	sig.payload = prepareRequest(token);
	fsm1.inputSignal(sig);

	console.log("Shift, new token: ", token.id, " passing " + sig.name + " command");
}catch(err) {console.log(err)}
//	currToken = getNextToken(token);
}

shiftRegFSM.init();

let makeRequestSignal =  { id: 99, name: "Make Request" };
let sendRequestSignal =  { id: 100, name: "Send Request" };
let timeoutSignal =  { id: 101, name: "Response Timeout" };
let waitForRequestSignal =  { id: 102, name: "Waiting for Request" };
let backToListeningSignal = { id: 103, name: "Back To  Waiting for Command" };
let responseReadySignal = { id: 104, name: "Response Ready" };
let dropResponseSignal = { id: 105, name: "Drop Late Response" };

let fsm1 = new FSM();

fsm1.init( {
	requestReadyToSend: {id: 1, on: requestReadyToSendCallback},
	requestSent: {id: 2, on: requestSentCallback},
	waitingForRequest: {id: 3, on: waitingForRequestCallback},
	responseReady: {id: 4, on: responseReadyCallback},
	} );

fsm1.awaiting.on = backToListeningCallback;

fsm1.awaiting.chain(makeRequestSignal.id, fsm1.requestReadyToSend)
	.chain(sendRequestSignal.id, fsm1.requestSent)
	.chain(waitForRequestSignal.id, fsm1.waitingForRequest)
	.chain(timeoutSignal.id, fsm1.requestSent)	

fsm1.waitingForRequest.chain(backToListeningSignal.id, fsm1.awaiting);

fsm1.waitingForRequest.chain(responseReadySignal.id, fsm1.responseReady)
	.chain(dropResponseSignal.id, fsm1.waitingForRequest);

fsm1.responseReady.chain(backToListeningSignal.id, fsm1.awaiting);

//fsm1.onSettle = (state, result) => { 
//	console.log("fsm1.onSettle ", state)
//}

fsm1.run();

currToken = genNextToken();

let req = prepareRequest(currToken);
 makeRequestSignal.payload = req;

fsm1.inputSignal(makeRequestSignal);


setResponseTimeout = function(delay) {
	setTimeout( 
		() => { 
			console.log("Retrying after ", delay, " ms")
			
			fsm1.inputSignal(timeoutSignal);

		}, delay );
}

const simulateResponse = token => { return { token, responseDescr: "qwertz"} }

sendRequestThenReceiveResponseDelayed = function(token, delay) {
	setTimeout( 
		() => { 
			console.log("Received response after ", delay, " ms, token: ", token.id)
			
			responseReadySignal.payload = simulateResponse(token);
			fsm1.inputSignal(responseReadySignal);

		}, delay );
}
