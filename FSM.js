export { FSM, AsyncFSM }

function waitPromise(interval) { 
	return new Promise( (resolve, _) => {
				 setTimeout( () => { 
				 	resolve( interval ); }, interval );
				} );
}

function TransitionEntry(nextState, transitionCallback, transitionFailureState) {
	this.nextState = nextState;
	this.callback = transitionCallback;
	this.failureState = transitionFailureState;
}

FSM.State = function(id, description, onCallback) {
	this.id = id;
	this.description = description;
	this.on = onCallback;
	
	this.transitionMap = new Map();
}

FSM.State.from = function(obj) {
//		let state = new State(obj.id, obj.description, obj.onCallback);
	let state = new FSM.State();
	Object.assign(state, obj);

	return state;
}

FSM.State.prototype.addTransition = function(signalID, transition) {
	this.transitionMap.set(signalID, transition);
	return transition.nextState;
};

FSM.State.prototype.getTransition = function(sig) {
	return this.transitionMap.get(sig);
}

FSM.State.prototype.chain = function(signalId, toState, transitionCallback, failureState) {
	this.addTransition(signalId, {nextState: toState, callback: transitionCallback, failureState});
	return toState;
}

FSM.Signal = function(id, transitionsCallbackArgs) {
	this.id = id;
	this.payload = transitionsCallbackArgs;
}


FSM.changeState = function(fsm, sig, state) {
	let result;
	let transition = state.getTransition(sig.id);

	if ( transition ) {
		try {
			fsm.onLeave && fsm.onLeave(this, state);
		}
		// do not consume callback exceptions
		finally	{
			try	{	

				(transition.callback && (result = transition.callback(sig.payload, state)))
						 || (result = sig.payload);
//				console.log("result = ", result, "sig.payload: ", sig.payload)
				state = transition.nextState;
			}
			catch (error) {
				result = error;
				console.log("FSM caught: ", error);

				state = transition.failureState || state;
			}
			state.settledResult = undefined;
			(state.on && (state.settledResult = FSM.tryCallback(state.on)(this, state, result)) ||
		 	(fsm.onSettle && (state.settledResult = FSM.tryCallback(fsm.onSettle)(this, state, result)))); 
		}
	}
	return state;		
}

function FSM() {
	this.idle = new FSM.State(-1, "Idle");
	this.awaiting = new FSM.State(0, "Running, awaiting signals");

	this.idle.chain(FSM.runFSMSignal.id, this.awaiting);

	this.states = new Map();
	this.states.set(this.idle.id, this.idle);
	this.states.set(this.awaiting.id, this.awaiting);

	this.currState = this.idle;
}

//FSM.tryCallback = (callback, fsmState) => {
FSM.tryCallback = callback => {
	return (...args) => {
		let result;
		try {
			callback && (result = callback(...args));
		}
		// do not consume callback exceptions
		finally {
			return result;
		}
	}
}

FSM.prototype = (function () {
	let protoObj = {};

	FSM.runFSMSignal = {id: -1};

	protoObj.constructor = FSM;

	protoObj.init = function( objStates ) {
		let state;

		if (objStates instanceof Array) {
			objStates.forEach( st => {
				st = st instanceof FSM.State ? st : FSM.State.from(st);
				this.states.set(st.id, st);

				if (st.name) this[st.name] = st;
			} )
		}
		else {
			Object.keys(objStates).forEach( key => {
				state = FSM.State.from(objStates[key]);
				this.states.set(state.id, state);
				this[key] = state;
			});
		}
		this.stop();
	}
	protoObj.stop  = function() {
		this.currState = this.idle;

		FSM.tryCallback(this.onIdle)(this, this.idle, "FSM stopped");
	}

	protoObj.run = function() {
		this.inputSignal(FSM.runFSMSignal);
	}

	protoObj.inputSignal = function(sig) {

		this.currState = FSM.changeState(this, sig, this.currState);
	}

	protoObj.inputSignalDelayed = function(sig, delay) {
		setTimeout( () => { this.inputSignal(sig) }, delay );	
	}

	protoObj.onSettle;

	return protoObj;
})();


function AsyncFSM() {
	FSM.call(this);
	
	this.promise = new Promise((resolve, _) => {
						resolve(this.idle);
					});
}
AsyncFSM.prototype = Object.create(FSM.prototype);
AsyncFSM.prototype.constructor = AsyncFSM;

AsyncFSM.prototype.stop  = function() {
	this.promise = new Promise((resolve, _) => {
						FSM.tryCallback(this.onIdle)(this, this.idle, "FSM stopped");
						
						resolve(this.idle);
					});
}

AsyncFSM.prototype.inputSignal = function(sig) {
	this.promise = this.promise.then( state => {return FSM.changeState(this, sig, state)} );
}

AsyncFSM.prototype.inputSignalDelayed = function(sig, delay) {
	this.promise = this.promise.then( async state => {
		await waitPromise(delay); 
			
		return state;
	})
	.then( state => {return FSM.changeState(this, sig, state)} );
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
