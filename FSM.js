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

function RequestResponseTimeoutPatternFSM(request, retrials, retrialDelay) {
	FSM.call(this);

//	this.retrials = retrials;
	this.genNextToken = token => {return token ? {id: token.id + 1} : {id: 1} }; 

	this.userRequest = request;
	this.retryRegister = new ShiftRegisterFSM(retrials, retrialDelay, this.genNextToken);
}

RequestResponseTimeoutPatternFSM.prototype = Object.create(FSM.prototype);
RequestResponseTimeoutPatternFSM.prototype.constructor = RequestResponseTimeoutPatternFSM;

RequestResponseTimeoutPatternFSM.makeRequestSignalId = 99;
RequestResponseTimeoutPatternFSM.sendRequestSignalId = 100;
RequestResponseTimeoutPatternFSM.timeoutSignalId = 101;
RequestResponseTimeoutPatternFSM.waitForRequestSignalId = 102;
RequestResponseTimeoutPatternFSM.backToListeningSignalId = 103;
RequestResponseTimeoutPatternFSM.responseReadySignalId = 104;
RequestResponseTimeoutPatternFSM.dropResponseSignalId = 105;

RequestResponseTimeoutPatternFSM.prototype.init = function() {

	const consumeResponse = response => {} 
	const validateResponse = (response, token) => { 
		return response.token.id === token.id; 
	}

	const requestReadyToSendCallback = (state, req) => {
		console.log("Request ready to send settled, request.token: ", req.token.id);

		this.retryRegister.run();
		this.retryRegister.shift(req.token);
	//	shiftRegFSM.shift(currToken);
		
		this.inputSignal({id: 100, payload: req});
	}

	const requestSentCallback = (state, req) => { 
	try {
		console.log("Request sent settled, request.token: ", req.token.id);
		this.currToken = req.token;

		this.inputSignal({id: 102, payload: req.token});

	}catch (err) { console.log(err)}
	}

	const waitingForResponseCallback = (state, token) => {
		console.log("Waiting for response ready settled, token: ", token.id);

		sendRequestThenReceiveResponseDelayed(token, 2400);
	}

	const responseReadyCallback = (state, response) => { 
		console.log("Response ready settled");

		try {
		if (validateResponse(response, this.currToken)) {
			console.log("Response valid !!!, token: ", response.token.id)

			this.inputSignal(backToListeningSignal);

			consumeResponse(response);
		}
		else {
			console.log("Response timed out, keep trying")

			this.inputSignal(dropResponseSignal);
			console.log("after drop")
		}
		} catch(err) {console.log(err)}
	}

	const backToListeningCallback = () => {
		console.log("Back to listening settled, stopping shift reg.");

	//	shiftRegFSM.reset();
		this.retryRegister.stop();
	}

	const simulateResponse = token => { return { token, responseDescr: "qwertz"} }

	const sendRequestThenReceiveResponseDelayed = (token, delay) => {
		setTimeout( 
			() => { 
				console.log("Received response after ", delay, " ms, token: ", token.id)
				
				let sig = {id: RequestResponseTimeoutPatternFSM.responseReadySignalId}
				sig.payload = simulateResponse(token);
				this.inputSignal(sig);

			}, delay );
	}

	this.retryRegister.onIdle = () => { console.log("shift reg stopped"); }

	//shiftRegFSM.onReset = () => { console.log("Shift reg. reset")}
	this.retryRegister.onLastSettle = () => {
		console.log("Last stage settled");

		//	fsm1.inputSignal(sig);
		this.inputSignal( { id: 103, name: "Giving up => Back To  Waiting for Command" } );
	}

	this.retryRegister.onSettle = (state, token) => {
		console.log("Shift, token: ", token.id, "state:", state.name);

		let sig;
	try {
		sig =  { id: 101, name: "Response Timeout"};
		
		this.retryRegister.shift(token);
			
		sig.payload = {token, userRequest: this.userRequest};

		this.retryRegister.inputSignal(sig);

		console.log("Shift, new token: ", token.id, " passing " + sig.name + " command");
	}catch(err) {console.log(err)}
	//	currToken = getNextToken(token);
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
		.chain(RequestResponseTimeoutPatternFSM.timeoutSignalId, this.requestSent)	

	this.waitingForRequest.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

	this.waitingForRequest.chain(RequestResponseTimeoutPatternFSM.responseReadySignalId, this.responseReady)
		.chain(RequestResponseTimeoutPatternFSM.dropResponseSignalId, this.waitingForRequest);

	this.responseReady.chain(RequestResponseTimeoutPatternFSM.backToListeningSignalId, this.awaiting);

	this.retryRegister.init();
}

RequestResponseTimeoutPatternFSM.prototype.send = function() {

	this.currToken = this.genNextToken();

//	let req = prepareRequest(currToken);
	let sig = {id: RequestResponseTimeoutPatternFSM.makeRequestSignalId}
	sig.payload = {token: this.currToken, userRequest: this.request};

	this.inputSignal(sig);
}

let fsm1 = new RequestResponseTimeoutPatternFSM({"My request"}, 4, 500);


fsm1.init();
fsm1.run();

fsm1.send();
