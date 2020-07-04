function Semaphore() {
	stSwitchedOn = new State(1, "semaphore just switched on.");
	stRed = new State(2, "Red Light is on.");
	stRedYellow = new State(3, "Both Red and Yellow Lights are on.");
	stYellow = new State(4, "Yellow Lights are on.");
	stGreen = new State(5, "Green Light is on.");
	stDeviceFailure = new State(55, "Simulate semaphore failure.");

	timeoutSignal = { id: 100 };
	switchOnSignal = { id: 101 }
	switchOffSignal = { id: 102 }
	deviceFailureSignal = { id: 103 }
	deviceRepairedSignal = { id: 104 }

	const propagationDelay = () => {}; 

	fsm = new FSM();

	fsm.awaiting.chain(switchOnSignal.id, stSwitchedOn, propagationDelay, stDeviceFailure)
			.chain(timeoutSignal.id, stRed, propagationDelay, stDeviceFailure)
			.chain(timeoutSignal.id, stRedYellow, propagationDelay, stDeviceFailure)
			.chain(timeoutSignal.id, stGreen, propagationDelay, stDeviceFailure)
			.chain(timeoutSignal.id, stYellow, propagationDelay, stDeviceFailure)
			.chain(timeoutSignal.id, stRed, propagationDelay, stDeviceFailure)
			.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure)
			.chain(deviceRepairedSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);

	stSwitchedOn.chain(switchOffSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);
	stRed.chain(switchOffSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);
	stRedYellow.chain(switchOffSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);
	stYellow.chain(switchOffSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);
	stGreen.chain(switchOffSignal.id, fsm.awaiting, propagationDelay, stDeviceFailure);

	stSwitchedOn.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure);
	stRed.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure);
	stRedYellow.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure);
	stYellow.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure);
	stGreen.chain(deviceFailureSignal.id, stDeviceFailure, propagationDelay, stDeviceFailure);

	fsm.init([stSwitchedOn, stRed, stRedYellow, stYellow, stGreen, stDeviceFailure]);

	fsm.onSettle = (state, transitionCallbackResult) => {
		console.log("Settled " + state.description + " with result: " + transitionCallbackResult);

		if ( state !== fsm.idle && state !== fsm.awaiting && state !== stDeviceFailure) switchLightsDelayed();
	}

	fsm.onLeave = state => {console.log("Leaved " + state.description);}

	fsm.run();
//	fsm.stop();

	const switchSemaphoreOn = () => { fsm.inputSignal(switchOnSignal); } 
	const switchLightsDelayed = () => { setTimeout( () => fsm.inputSignal(timeoutSignal), 200); }
	const switchSemaphoreOff = () => { setTimeout( () => fsm.inputSignal(switchOffSignal), 2000); }

	switchSemaphoreOn();
	switchSemaphoreOff();
}

Semaphore();


			
