//(function () {

	TransitionEntry = function(nextState, transitionCallback, transitionFailureState) {
		this.nextState = nextState;
		this.callback = transitionCallback;
		this.failureState = transitionFailureState;
	}

	State = function(id, description) {
		this.id = id;
		this.description = description;
		
		this.transitionMap = new Map();
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
		this.callbackArgs = transitionsCallbackArgs;
	}

	FSM = function() {
		this.idle = new State(-1, "Idle");
		this.awaiting = new State(0, "Running, awaiting signals");

		this.states = new Map();
		this.states.set(this.idle.id, this.idle);
		this.states.set(this.awaiting.id, this.awaiting);

		this.promise = new Promise((resolve, reject) => {
							resolve(this.idle);
						});
	}

	FSM.prototype.init = function( states ) {
		states.forEach( val => this.states.set(val.id, val) );

		this.stop();
	}

	FSM.prototype.stop  = function() {
		this.promise = this.promise.then( (_) => { 
			this.onSettle && this.onSettle(this.idle, "FSM stopped" );
			return this.idle;
		})
	}

	FSM.prototype.add = function( state ) {
		this.states.set(state.id, state);
	}

	FSM.prototype.printState = function() {
		this.promise = this.promise.then( state => { console.log( state ); return state;} );
	}

	FSM.prototype.run = function() {
		this.inputSignal();
	}

	FSM.prototype.inputSignal = function(sig) {
		let result;

		if (!this.promise) {
			throw("FSM not initialized. run init() before run().")
		}

		this.promise = this.promise.then( state => {
			console.log("before transition: ", state);
			
			if (sig === undefined)	// use undefined signal for FSM.run() 
				return sig === undefined && state === this.idle ? this.awaiting : state;


			let transition = state.getTransition(sig.id);

			if ( transition ) {
				this.onLeave && this.onLeave(state);
				
				try	{	
					transition.callback && (result = transition.callback(sig.callbackArgs));
		
					return transition.nextState;
				}
				catch (error) {
					result = error;

					return transition.failureState || state;
				}
			}
			return state;		
		})
		.then( state => { this.onSettle && this.onSettle(state, result); return state; });

	//	.then( state => { console.log("after transition:"); this.printState(state); return state;} );
	}
//})();
//import * as AP from '/static/FSM.js'      

