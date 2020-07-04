TransitionEntry = function(nextStateId, transitionCallback, transitionFailureStateId) {
	this.nextStateId = nextStateId;
	this.callback = transitionCallback;
	this.failureStateId = transitionFailureStateId;
}

State = function(id, description) {
	this.id = id;
	this.description = description;
	
	this.transitionMap = new Map();
}

State.prototype.addTransition = function(signalID, transition) {
	this.transitionMap.set(signalID, transition);
};

State.prototype.getTransition = function(sig) {
	return this.transitionMap.get(sig);
}

Signal = function(id, transitionsCallbackArgs) {
	this.id = id;
	this.callbackArgs = transitionsCallbackArgs;
}

FSM = function() {
	this.idle = new State(-1, "Idle");
	this.awaiting = new State(0, "Running, awaiting signals");

//	this.states = new Array(this.idle, this.awaiting);
	this.states = new Map();
	this.states.set(this.idle.id, this.idle);
	this.states.set(this.awaiting.id, this.awaiting);

	this.promise = new Promise((resolve, reject) => {
						resolve(this.idle);
					});
	//.then(state=>{console.log(state);});
}

FSM.prototype.init = function( states ) {
	states.forEach( val => this.states.set(val.id, val) );
}

FSM.prototype.add = function( state ) {
//	this.states.push(state);
	this.states.set(state.id, state);
}

FSM.prototype.printState = function() {
	this.promise = this.promise.then( state => { console.log( state ); return state;} );
}

FSM.prototype.run = function() {
	this.inputSignal();
/*	this.promise = this.promise.then( state => {
		return state === this.idle ? this.awaiting : state;
	});
	*/
}

FSM.prototype.inputSignal = function(sig) {
//	let transition = this.currentState.getTransition(sig.id);
	let result;

	this.promise = this.promise.then( state => {
		console.log("before transition: ", state);
		
		if (sig === undefined)	// use undefined signal for FSM.run() 
			return state === this.idle ? this.awaiting : state;


		let transition = state.getTransition(sig.id);

		if ( transition ) {
			this.onLeave && this.onLeave(state);
			
			try	{	
				transition.callback && (result = transition.callback(sig.callbackArgs));
	
				return this.states.get(transition.nextStateId);
			}
			catch (error) {
				result = error;
				return this.states.get(transition.failureStateId);
			}

		}
		return state;		
	})
	.then( state => { this.onSettle && this.onSettle(state, result); return state; });

//	.then( state => { console.log("after transition:"); this.printState(state); return state;} );
}


fsm = new FSM();
fsm.onSettle = (state, transitionCallbackResult) => {console.log("Settled " + state.description + " with result: " + transitionCallbackResult);}
fsm.onLeave = state => {console.log("Leaved " + state.description);}

state1 = new State(1, "state 1");

state2 = new State(2, "state 2");


at1 = new TransitionEntry(1, (sig) => 
	{console.log("move by signal: " + sig.id); return 12345;}, 
	fsm.awaiting.id);
fsm.awaiting.addTransition(100, at1);
at2 = new TransitionEntry(2, (sig) => {console.log("move by signal: " + sig.id); return 2222}, fsm.awaiting.id);
fsm.awaiting.addTransition(101, at2);

t1 = new TransitionEntry(2, (sig) => {console.log("move by signal: " + sig.id); return 3333}, fsm.awaiting.id);
state1.addTransition(101, t1);

//t2 = new TransitionEntry(1, (sig) => {console.log("move by signal: " + sig.id); return 4444}, fsm.awaiting.id);
t2 = new TransitionEntry(1, (sig) => {throw "ERROR !!!!"}, fsm.awaiting.id);
state2.addTransition(102, t2);

asig1 = new Signal(100);
asig1.callbackArgs = asig1;
sig1 = new Signal(101);
sig1.callbackArgs = sig1;
sig2 = new Signal(102);
sig2.callbackArgs = sig2;

fsm.init([state1, state2]);
fsm.run();

fsm.inputSignal(sig1); // from await to 2
fsm.inputSignal(sig2); // from 2 to 1
//fsm.printState();
//fsm.printState();
//console.log( fsm.state );