/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />

function Timer(callback, timeInterval, options) {
	this.timeInterval = timeInterval;

	// Add method to start timer
	this.start = () => {
		// Set the expected time. The moment in time we start the timer plus whatever the time interval is. 
		this.expected = Date.now() + this.timeInterval;
		// Start the timeout and save the id in a property, so we can cancel it later
		this.theTimeout = null;

		if (options.immediate) {
			callback();
		}

		this.timeout = setTimeout(this.round, this.timeInterval);
		// console.log('Timer Started');
	}
	// Add method to stop timer
	this.stop = () => {
		clearTimeout(this.timeout);
		// console.log('Timer Stopped');
	}
	// Round method that takes care of running the callback and adjusting the time
	this.round = () => {
		// console.log('timeout', this.timeout);
		// The drift will be the current moment in time for this round minus the expected time..
		let drift = Date.now() - this.expected;
		// Run error callback if drift is greater than time interval, and if the callback is provided
		if (drift > this.timeInterval) {
			// If error callback is provided
			if (options.errorCallback) {
				options.errorCallback();
			}
		}
		callback();
		// Increment expected time by time interval for every round after running the callback function.
		this.expected += this.timeInterval;
		// console.log('Drift:', drift);
		// console.log('Next round time interval:', this.timeInterval - drift);
		// Run timeout again and set the timeInterval of the next iteration to the original time interval minus the drift.
		this.timeout = setTimeout(this.round, this.timeInterval - drift);
	}
}

// Action Cache
const MACTIONS = {};

// Action Events
const metronomeAction = new Action('com.elgato.metronome.action');
const click1 = new Audio("actions/template/assets/click1.mp3");
const click2 = new Audio("actions/template/assets/click2.mp3");

let bpm = 140;
let beatsPerMeasure = 4;
let count = 0;
let beatMode = 0; // 0 = none; 1 = first; 2 = last; 3 = even; 4 = odd
let isRunning = false;
let mode = 1; // mode 1 = bpm; mode 2 = beats per minute; mode 3 = beat modes
let typeString = ' bpm';
let layout = 'libs/layouts/bpm.json';

metronomeAction.onWillAppear(({ context, payload }) => {
	MACTIONS[context] = new MetronomeAction(context, payload);
	$SD.getSettings(context);
	MACTIONS[context].setDisplayValue();
});

metronomeAction.onWillDisappear(({ context }) => {
	MACTIONS[context].interval && clearInterval(MACTIONS[context].interval);
	delete MACTIONS[context];
});

metronomeAction.onDidReceiveSettings(({ context, payload }) => {
	const { settings } = payload;
	bpm = settings.bpm;
	beatsPerMeasure = settings.beatsPerMeasure;
	beatMode = settings.beatMode;
	mode = settings.mode;
	typeString = settings.typeString;
	layout = settings.layout;
	MACTIONS[context].handleUpdateMetronomeInterval();
	$SD.send(context, 'setFeedbackLayout', { payload: { layout } });
	MACTIONS[context].setDisplayValue();
	MACTIONS[context].settings = payload.settings;
});

metronomeAction.onDialRotate(({ context, payload }) => {
	if (payload.hasOwnProperty('ticks')) {
		if (mode === 1) MACTIONS[context].handleChangeBpm(payload.ticks);
		else if (mode === 2) MACTIONS[context].handleChangeBeatsPerMeasure(payload.ticks);
		else MACTIONS[context].handleChangeBeatMode(payload.ticks);
	}
});

metronomeAction.onDialDown(({ context, payload }) => {
	MACTIONS[context].toggleMode();
});

metronomeAction.onTouchTap(({ context, payload }) => {
	if (payload.hold === false) {
		MACTIONS[context].toggleIsRunning();
	}
});

function playClick() {
	if (count === beatsPerMeasure) {
		count = 0;
	}
	switch (beatMode) {
		case 1:
			if (count === 0) playOffClick();
			else playRegularClick();
			break;
		case 2:
			if (count === beatsPerMeasure - 1) playOffClick();
			else playRegularClick();
			break;
		case 3:
			if (count % 2 !== 0) playOffClick();
			else playRegularClick();
			break;
		case 4:
			if (count % 2 === 0) playOffClick();
			else playRegularClick();
			break;
		default:
			playRegularClick();
			break;
	}
	count++;
}

const playOffClick = () => {
	click1.play();
	click1.currentTime = 0;
}
const playRegularClick = () => {
	click2.play();
	click2.currentTime = 0;
}

const metronome = new Timer(playClick, 60000 / bpm, { immediate: true });

class MetronomeAction {
	constructor(context, payload) {
		this.isEncoder = payload.controller === 'Encoder';
		this.context = context;
		this.interval = null;

		if (this.isEncoder) {
			this.width = 100; // default width of the panel is 100
			this.height = 50; // default height of the panel is 50
		} else {
			this.width = 144; // default width of the icon is 72
			this.height = 144; // default width of the icon is 72
		}
		this.scale = 2;
		this.iconSize = 48 * this.scale; // default size of the icon is 48
	}

	toggleIsRunning() {
		count = 0;
		if (!isRunning) {
			metronome.start();
			isRunning = true;
		} else {
			metronome.stop();
			isRunning = false;
		}
	}

	toggleMode() {
		const maxModes = 3;
		const newMode = mode + 1;
		mode = newMode > maxModes ? 1 : newMode;
		layout = mode === 1 ? "libs/layouts/bpm.json" : mode === 2 ? "libs/layouts/beatsPerMeasure.json" : "libs/layouts/beatMode.json";
		$SD.send(this.context, 'setFeedbackLayout', { payload: { layout } });
		this.setDisplayValue();
	}

	handleChangeBpm(ticks) {
		let displayValue = bpm + ticks;
		displayValue = displayValue > 280 ? 280 : displayValue < 20 ? 20 : displayValue;
		bpm = displayValue;
		this.handleUpdateMetronomeInterval();
		this.setDisplayValue();
	}

	handleChangeBeatsPerMeasure(ticks) {
		let displayValue = beatsPerMeasure + ticks;
		displayValue = displayValue > 12 ? 12 : displayValue < 1 ? 1 : displayValue;
		beatsPerMeasure = displayValue;
		count = 0;
		this.setDisplayValue();
	}

	handleChangeBeatMode(ticks) {
		let displayValue = beatMode + ticks;
		displayValue = displayValue > 4 ? 4 : displayValue < 0 ? 0 : displayValue;
		beatMode = displayValue;
		count = 0;
		this.setDisplayValue();
	}

	handleUpdateMetronomeInterval = () => {
		metronome.timeInterval = 60000 / bpm;
	}

	setDisplayValue = () => {
		let displayValue;
		let bpmValue;

		switch (mode) {
			case 1:
				displayValue = bpm;
				typeString = ' bpm';
				break;
			case 2:
				displayValue = beatsPerMeasure;
				typeString = '/4 time';
				break;
			default:
				switch (beatMode) {
					case 1:
						displayValue = 'first beat';
						break;
					case 2:
						displayValue = 'last beat';
						break;
					case 3:
						displayValue = 'even beats';
						break;
					case 4:
						displayValue = 'odd beats';
						break;
					default:
						displayValue = 'none';
						break;
				}
				typeString = '';
				break;
		}

		if (mode !== 3) bpmValue = (((displayValue) - 20) / (280 - 20)) * 100;

		$SD.setFeedback(this.context, {
			value: `${displayValue}${typeString}`,
			indicator: (mode !== 3) ? displayValue : 0
		});
		$SD.setSettings(this.context, {
			value: `${displayValue}${typeString}`,
			indicator: (mode !== 3) ? displayValue : 0,
			bpm,
			beatsPerMeasure,
			beatMode,
			mode,
			typeString,
			layout
		});
	}
};
