(() => {
  'use strict';

  angular.module('testWitnessDemo', []).service('testWitnessService', TestWitnessService);
  TestWitnessService.$inject = ['$q', '$window'];

  function TestWitnessService($q, $window) {
    const browserApi = $window.TestWitness;
    if (!browserApi || typeof browserApi.TestWitness !== 'function') {
      throw new Error('TestWitness browser bundle is unavailable.');
    }

    const witness = new browserApi.TestWitness({
      applicationName: 'AngularJS QA Demo',
      environment: 'local',
      releaseVersion: '1.0.0',
      session: { testCaseId: 'NG1-LOGIN-001', testCaseName: 'Successful login' },
      screenshot: {
        enabled: true,
        format: 'png',
        captureOnStart: true,
        captureOnNavigation: true,
        captureOnError: true,
      },
      video: { enabled: false, includeAudio: false, maxDurationMinutes: 10 },
      actions: { enabled: true, captureTextInputValues: false },
      network: {
        enabled: true,
        captureSuccessfulRequests: true,
        captureRequestBody: false,
        captureResponseBody: false,
      },
      privacy: { maskSelectors: ['[data-private]'] },
      toolbar: { enabled: false },
    });

    this.initialize = () => $q.when(witness.initialize());
    this.startSession = (metadata, options) => $q.when(witness.startSession(metadata, options));
    this.pauseSession = () => witness.pauseSession();
    this.resumeSession = () => witness.resumeSession();
    this.captureScreenshot = (label) => $q.when(witness.captureScreenshot(label));
    this.addNote = (text) => witness.addNote(text);
    this.setResult = (result) => witness.setSessionResult(result);
    this.stopSession = () => $q.when(witness.stopSession());
    this.downloadEvidence = () => $q.when(witness.downloadEvidence());
    this.getStatus = () => witness.getSessionStatus();
    this.getSummary = () => witness.getSessionSummary();
    this.destroy = () => $q.when(witness.destroy());
  }
})();
