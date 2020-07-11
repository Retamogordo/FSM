
function genPromise(executor) {
	return (executor instanceof Promise) ? executor : new Promise(executor);
}

/*
	Implementation of Promise which will reject after specified timeout elapsed
*/
export function promiseTimeout(executor, interval) {
	let timerId;

	let promise = genPromise(executor);

	// this means no race is performed, opposite meaning of setTimeout interval omitting
	// for race and reject immeditely use interval = 0
	if (interval === undefined) return promise;

	let waitPromise = new Promise( (_, reject) => {
					 timerId = setTimeout( () => { 
					 	reject( new PromiseTimeoutException(promise, interval) ); 
					 }, interval );
					} );

	return Promise.race([promise, waitPromise])
			.then( value => {
				clearTimeout(timerId);

				return Promise.resolve(value);
			});			
}

function PromiseTimeoutException(promise, interval) {
	this.promise = promise;
	this.interval = interval;
	this.message = "Promise timed out: " + interval + " mSec";
}

function PromiseRetryException(error, retrial) {
	this.error = error;
	this.retrial = retrial;
}

function retryState() {
	this.userCallBack = undefined;
	this.retrials = 0;
	this.timeoutIter = undefined;
	this.timeout = undefined;
}

function retryFunc(executor, retryCallback, currRetryState) {

	console.log("in RETRY, timeout: ", currRetryState.timeout, " retrial: ", currRetryState.retrials)

//	let p =	currRetryState.timeout === undefined ? new Promise(executor) : promiseTimeout(executor, currRetryState.timeout);
	let p =	currRetryState.timeout === undefined ? genPromise(executor) : promiseTimeout(executor, currRetryState.timeout);
  	
  	return p.catch(err => {
		console.log("in RETRY CATCH  ", err)
			
		let newRetryState = retryCallback( currRetryState );

		if ( newRetryState ) 
			if ( newRetryState.userCallBack && 
				 newRetryState.userCallBack(new PromiseRetryException(err, newRetryState.retrials)) )
				return new retryFunc(executor, retryCallback, newRetryState);
	
		return Promise.reject(err);

	});
 }

function genNextOptionalTimeoutRetryState(state) {

	state.retrials++;

	return state;
}

/*
	Pattern for promise retry.
	This function wraps original rejected errors by PromiseRetryException instance which contains
	number of retrials commited so far. This can be useful for retryUserCallback to decide if it makes
	sense to continue retrying.
	retryUserCallback must return a boolean on which depends whether retrying process should go on.
	if retryUserCallback is not provided Promise rejects.
	Optional timeout creates race condition with timer so the Promise can reject if time is out.
*/
export function promiseRetryOptional(executor, retryUserCallback, timeout) {
	let state = new retryState();
	
	state.timeout = timeout;
	state.userCallBack = retryUserCallback;
	
	return retryFunc(executor, genNextOptionalTimeoutRetryState, state);

}

export function promiseRetryMaxTrials(executor, retryUserCallback, maxRetrials, timeout) {
	let state = new retryState();
	
	state.timeout = timeout;
	state.userCallBack = (err) => { 
		retryUserCallback(err);
		return state.retrials < maxRetrials;
	}

	return retryFunc(executor, genNextOptionalTimeoutRetryState, state);
}


function genNextTimeoutRetryState(state) {
	let nextTimeout = state.timeoutIter.next();

	if (nextTimeout.done) return undefined;

	state.retrials++;
	state.timeout = nextTimeout.value;
	return state;
}

export function promiseRetryTimeout(executor, timeoutArray, retryUserCallBack) {
	
	let state = new retryState();
	state.timeoutIter = timeoutArray.values();
	state.timeout = state.timeoutIter.next().value;

	console.log("TIMEOUT ARRAY: ", timeoutArray)
	console.log("TIMEOUT iter value: ", state.timeout)

	state.userCallBack = (err) => { 
		retryUserCallBack(err);
		return !state.timeoutIter.done;
	}

	return retryFunc(executor, genNextTimeoutRetryState, state);
}