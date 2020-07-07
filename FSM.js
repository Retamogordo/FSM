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
		this.callbackArgs = transitionsCallbackArgs;
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

		this.promise = this.promise.then( async state => {
			
			transition = state.getTransition(sig.id);

	//		console.log("transition: ", transition)
			
			if ( transition ) {
				try {
					this.onLeave && this.onLeave(state);
				}
				// do not consume callback exceptions
				finally	{
					try	{	
						// if no transition delay => run callback (if any) synchronously
						(!transition.delay && transition.callback && 
							(result = transition.callback(sig.callbackArgs)) ) ||
						// else run asynchronously with timeout limit of transition delay,
						// if no callback => just wait delay ms
						(transition.delay && 
							 await waitPromise(transition.delay) && transition.callback && 
							(result = transition.callback(sig.callbackArgs)));

//			console.log("nextState: ", transition.nextState)
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
		.then( state => { return transition && 
									( (state.on && tryCallback(state.on, state)(state, result)) ||
									  (this.onSettle && tryCallback(this.onSettle, state)(state, result)) ); });

//		.then( state => {  this.onSettle(state, result); return state; });
			
	}
//})()
function ShiftRegisterFSM(length, transitionDelay) {
	console.log("in ShiftRegisterFSM")
	FSM.call(this);

	this.length = length;
	this.transitionDelay = transitionDelay;
}

ShiftRegisterFSM.prototype = Object.create(FSM.prototype);
ShiftRegisterFSM.prototype.constructor = ShiftRegisterFSM;
ShiftRegisterFSM.shiftSignalID = 100;
ShiftRegisterFSM.resetSignalID = 101;

ShiftRegisterFSM.prototype.init = function () {
	let state = this.awaiting;
	let firstState;
	let id = 1;
	let newState;
	let length = this.length;

	let states = [];
	while (length--) {
		newState = state.chain( ShiftRegisterFSM.shiftSignalID, State.from({ id, name: "shiftState" + id}));
//		newState = state.chain( 100, State.from({ id, name: "shiftState" + id, on: shiftCallback}));
		state.getTransition(ShiftRegisterFSM.shiftSignalID).delay = this.transitionDelay;

		firstState = firstState || newState;
		
		newState.chain( ShiftRegisterFSM.resetSignalID, this.awaiting); // reset

		state = newState;
		
		++id;

		states.push(state);
	}

	if (firstState) {
		state.chain( ShiftRegisterFSM.shiftSignalID, firstState).chain( ShiftRegisterFSM.resetSignalID, shiftRegFSM.awaiting);
		state.getTransition(ShiftRegisterFSM.shiftSignalID).delay = this.transitionDelay;
//	state !== shiftRegFSM.awaiting && shiftRegFSM.states.push(state);
//		this.states.set(state.id, state);
	}
	console.log(states);

	FSM.prototype.init.call(this, states);
}

let fsm1 = new FSM();
let fsm2 = new FSM();
let shiftRegFSM = new ShiftRegisterFSM(3, 1000);


const shiftCallback = transitionCallbackResult => { console.log("Shift to", this.name)}


shiftRegFSM.onSettle = (state, val) => {console.log("Settled: ", state.name);}
//chainShiftReg(3, 1000)
shiftRegFSM.init();
shiftRegFSM.run();
shiftRegFSM.inputSignal({id: 100});
shiftRegFSM.inputSignal({id: 100});
shiftRegFSM.inputSignal({id: 100});
shiftRegFSM.inputSignal({id: 100});
shiftRegFSM.inputSignal({id: 100});
shiftRegFSM.inputSignal({id: 100});

console.log(shiftRegFSM.shiftState1)


const firstCallback = transitionCallbackResult => { console.log("first settled")}
const secondCallback = transitionCallbackResult => { console.log("second settled")}

const requestSentCallback = transitionCallbackResult => { console.log("Request sent settled")}
const responseReadyCallback = transitionCallbackResult => { console.log("Response ready settled")}
const noResponseCallback = transitionCallbackResult => { console.log("No response settled")}

let sendRequestSignal =  { id: 100 };
let timeoutSignal =  { id: 101 };
let yieldSignal =  { id: 102 };
let backToListeningSignal = { id: 103 };
let responseReadySignal = { id: 104 };

const sendRequestOut = (req) => {
	// sending code here
	console.log("Sending request...");
	sendRequestThenReceiveResponseDelayed(2000);
};
const consumeResponse = (resp) => {
	// 
};

setResponseTimeout = function(delay) {
	setTimeout( 
		() => { 
			console.log("Retrying after ", delay, " ms")
			
			fsm1.inputSignal(timeoutSignal);

		}, delay );
}

sendRequestThenReceiveResponseDelayed = function(delay) {
	setTimeout( 
		() => { 
			console.log("Received response after ", delay, " ms")
			
			fsm1.inputSignal(responseReadySignal);

		}, delay );
}

fsm1.init( {
	requestSent: {id: 1, on: requestSentCallback},
	responseReady: {id: 2, on: responseReadyCallback},
	noResponse: {id: 3, on: noResponseCallback}
	} );

fsm1.awaiting.chain(sendRequestSignal.id, fsm1.requestSent, sendRequestOut)
	.chain(timeoutSignal.id, fsm1.requestSent)
	.chain(yieldSignal.id, fsm1.noResponse)
	.chain(backToListeningSignal.id, fsm1.awaiting);

fsm1.requestSent.chain(responseReadySignal.id, fsm1.responseReady, consumeResponse)
	.chain(backToListeningSignal.id, fsm1.awaiting);
	

//fsm1.run();

//fsm1.state1.getTransition(nextSignal.id)
//fsm1.run();
/*
let st3 = new State(3);
st3.on = transitionCallbackResult => { console.log("third settled")}

fsm2.init( [{id: 1, name: "firstState", description: "qq", on: firstCallback}, 
	{id: 2, name: "secondState", description: "qq", on: secondCallback}, st3])

fsm2.awaiting.chain(nextSignal.id, fsm2.firstState).chain(nextSignal.id, fsm2.secondState).chain(nextSignal.id, 
	st3);

//fsm1.state1.getTransition(nextSignal.id)
fsm2.run();

fsm2.inputSignal(nextSignal)
fsm2.inputSignal(nextSignal)
fsm2.inputSignal(nextSignal)
fsm2.inputSignal(nextSignal)
*/

