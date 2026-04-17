function RemoteVideo(remoteVideoElem, videoLoader, videoStats) {
    this.streaming = null;
    this.remoteVideoElem = remoteVideoElem;
    this.videoLoader = videoLoader;
    this.videoStats = videoStats;
    this.stream = null;
    this.mountpointId = null;

    this.videoResolution = null;
    this.isVideoAlreadyPlayed = false;
    this.watchPin = null;
    this.watchRetryTimeoutId = null;
    this.watchRetryCount = 0;
    this.watchRestartAttempted = false;
    this.MAX_WATCH_RETRIES = 8;
    this.WATCH_RETRY_DELAY_MS = 1500;

    var obj = this;  // for event handlers

    this.getStreamVideotracks = function(){
        return this.stream ? this.stream.getVideoTracks() : [];
    }

    this.noRemoteVideo = function () {
        if (!this.isVideoAlreadyPlayed || window.debugUtils.isDebugEnabled()) {
            this.videoLoader.show();
        }
        console.debug('video: no remote');
    }

    this.hasRemoteVideo = function () {
        this.videoLoader.hide();
        console.debug('video: has remote');
    }

    this.setStreamingPluginHandle = function(streaming){
        this.streaming = streaming;
    }

    this.setResolution = function(w, h){
        this.videoResolution = [w, h];
        this.remoteVideoElem.attr('width', w).attr('height', h);
    }

    this.setStream = function (stream) {
        let streamChanged = false;
        if (this.stream !== stream) {
            this.stream = stream;
            streamChanged = true;
        }

        if (this.getStreamVideotracks().length > 0) {
            this.cancelWatchRetry();
            if (streamChanged) {
                Janus.attachMediaStream(this.remoteVideoElem.get(0), this.stream);
            }
            this.hasRemoteVideo();
            if (['chrome', 'firefox', 'safari'].indexOf(Janus.webRTCAdapter.browserDetails.browser) >= 0) {
                this.videoStats.start();
            }
        } else {
            this.noRemoteVideo();
            this.videoStats.stop();
        }
    }

    this.hasActiveVideoTrack = function () {
        return this.getStreamVideotracks().length > 0;
    }

    this.sendWatchRequest = function () {
        if (!this.streaming || !this.mountpointId) {
            return;
        }
        var body = {"request": "watch", "id": this.mountpointId, "pin": this.watchPin};
        console.info("streaming: sending watch request for mountpoint " + this.mountpointId);
        this.streaming.send({"message": body});
    }

    this.cancelWatchRetry = function () {
        if (this.watchRetryTimeoutId !== null) {
            clearTimeout(this.watchRetryTimeoutId);
            this.watchRetryTimeoutId = null;
        }
    }

    this.scheduleWatchRetry = function () {
        this.cancelWatchRetry();
        if (this.hasActiveVideoTrack()) {
            return;
        }

        if (this.watchRetryCount >= this.MAX_WATCH_RETRIES) {
            this.forceWatchRestartIfNeeded();
            return;
        }

        var self = this;
        this.watchRetryTimeoutId = setTimeout(function () {
            self.watchRetryCount += 1;
            if (self.hasActiveVideoTrack()) {
                return;
            }
            console.warn("streaming: no video track yet, retrying watch (attempt " + self.watchRetryCount + ")");
            self.sendWatchRequest();
            self.scheduleWatchRetry();
        }, this.WATCH_RETRY_DELAY_MS);
    }

    this.forceWatchRestartIfNeeded = function () {
        if (this.watchRestartAttempted || this.hasActiveVideoTrack() || !this.streaming) {
            return;
        }
        this.watchRestartAttempted = true;

        console.warn("streaming: retries exhausted, forcing stop/watch restart");
        this.streaming.send({"message": {"request": "stop"}});

        var self = this;
        setTimeout(function () {
            if (self.hasActiveVideoTrack()) {
                return;
            }
            self.watchRetryCount = 0;
            self.sendWatchRequest();
            self.scheduleWatchRetry();
        }, 400);
    }

    this.refreshWatchIfNeeded = function (reason) {
        if (this.hasActiveVideoTrack()) {
            return;
        }
        console.info("streaming: refresh watch requested (" + reason + ")");
        this.sendWatchRequest();
        this.scheduleWatchRetry();
    }

    this.startStreamMountpoint = function (mountpointId, pin) {
        this.mountpointId = mountpointId;
        this.watchPin = pin;
        this.watchRetryCount = 0;
        this.watchRestartAttempted = false;
        console.info("streaming: starting mountpoint id " + mountpointId + ' with pin ' + pin);

        this.sendWatchRequest();
        this.scheduleWatchRetry();
        this.noRemoteVideo();
    }

    this.remoteVideoElem.on("playing", function (e) {
        console.debug('video: playing event', e);

        if (obj.getStreamVideotracks().length > 0) {
            obj.videoStats.start();
            remoteVideoElem = obj.remoteVideoElem.get(0);
            obj.setResolution(remoteVideoElem.videoWidth, remoteVideoElem.videoHeight);
            obj.isVideoAlreadyPlayed = true;
        } else {
            obj.videoStats.stop();
        }
    });

    this.stopStreaming = function () {
        console.info('video: stopping streaming');
        this.cancelWatchRetry();
        this.streaming.send({"message": {"request": "stop"}});
        this.streaming.hangup();
        this.cleanup();
    }

    this.cleanup = function () {
        console.info('video: cleanup ..');
        this.cancelWatchRetry();
        this.watchRetryCount = 0;
        this.watchRestartAttempted = false;
        this.videoStats.stop();
    }
}
