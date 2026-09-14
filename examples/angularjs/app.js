(() => {
  'use strict';

  angular.module('testWitnessDemo').controller('DemoController', DemoController);
  DemoController.$inject = ['$q', '$scope', 'testWitnessService'];

  function DemoController($q, $scope, testWitnessService) {
    const vm = this;
    vm.status = 'initializing';
    vm.message = '';
    vm.note = 'Validated the successful login scenario';
    vm.result = 'not-set';
    vm.captureVideo = false;
    vm.videoStatus = 'off';
    vm.busy = true;

    function refreshStatus() {
      const summary = testWitnessService.getSummary();
      vm.status = summary.status;
      vm.videoStatus = summary.videoStatus;
    }

    // Invoke the operation synchronously before adopting its promise. This preserves the
    // user activation required by getDisplayMedia when Start is clicked.
    function run(operation) {
      vm.busy = true;
      vm.message = '';
      let result;
      try {
        result = operation();
      } catch (error) {
        result = $q.reject(error);
      }
      return $q
        .when(result)
        .catch((error) => {
          vm.message = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          vm.busy = false;
          refreshStatus();
        });
    }

    vm.start = () =>
      run(() =>
        testWitnessService
          .startSession({ testerName: 'AngularJS tester' }, { captureVideo: vm.captureVideo })
          .then((summary) => {
            vm.message =
              summary.videoStatus === 'recording'
                ? 'Session and browser-tab video are recording.'
                : 'Session started without video.';
          }),
      );
    vm.pauseOrResume = () =>
      run(() => {
        const summary =
          vm.status === 'paused'
            ? testWitnessService.resumeSession()
            : testWitnessService.pauseSession();
        vm.message = summary.status === 'paused' ? 'Capture paused.' : 'Capture resumed.';
      });
    vm.capture = () =>
      run(() =>
        testWitnessService
          .captureScreenshot('Login completed')
          .then(() => (vm.message = 'Screenshot captured.')),
      );
    vm.addNote = () =>
      run(() => {
        testWitnessService.addNote(vm.note);
        vm.note = '';
        vm.message = 'Note added.';
      });
    vm.selectResult = () => {
      if (vm.status === 'recording' || vm.status === 'paused') {
        testWitnessService.setResult(vm.result);
      }
    };
    vm.stop = () =>
      run(() => {
        testWitnessService.setResult(vm.result);
        return testWitnessService.stopSession().then(() => (vm.message = 'Session stopped.'));
      });
    vm.download = () =>
      run(() =>
        testWitnessService
          .downloadEvidence()
          .then(() => (vm.message = 'Evidence download started.')),
      );

    testWitnessService.initialize().then(
      () => {
        vm.busy = false;
        vm.message = 'Ready.';
        refreshStatus();
      },
      (error) => {
        vm.busy = false;
        vm.message = error instanceof Error ? error.message : String(error);
      },
    );

    $scope.$on('$destroy', () => {
      void testWitnessService.destroy();
    });
  }
})();
