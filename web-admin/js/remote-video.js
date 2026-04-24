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
    this.PLAY_RETRY_DELAY_MS = 250;
    this.PLAY_RETRY_COUNT = 8;
    this.rotationDeg = 0;

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

    this.getRotation = function(){
        return this.rotationDeg;
    }

    this.setRotation = function(deg){
        var normalized = ((parseInt(deg, 10) || 0) % 360 + 360) % 360;
        this.rotationDeg = normalized;
        this.remoteVideoElem.css('transform', 'rotate(' + normalized + 'deg)');
        this.remoteVideoElem.css('transform-origin', 'center center');
        $('#deviceGestures').attr('data-rotation', normalized);
        this._applyLayout();
    }

    // Resize #windowStream and reposition the video so the container matches the
    // visual (post-rotation) dimensions — prevents the black-area gap that appears
    // when CSS rotate() is used without reflowing the parent.
    this._applyLayout = function() {
        var vw = parseInt(this.remoteVideoElem.attr('width') || 0);
        var vh = parseInt(this.remoteVideoElem.attr('height') || 0);
        if (!vw || !vh) { return; }
        var rot = this.rotationDeg;
        if (rot === 90 || rot === 270) {
            // Container takes the swapped (landscape) dimensions.
            // Video is shifted so its centre aligns with the container centre.
            var shift = (vh - vw) / 2;
            $('#windowStream').css({ width: vh + 'px', height: vw + 'px', overflow: 'hidden' });
            this.remoteVideoElem.css({ position: 'absolute', left: shift + 'px', top: -shift + 'px' });
        } else {
            $('#windowStream').css({ width: '', height: '', overflow: '' });
            this.remoteVideoElem.css({ position: '', left: '', top: '' });
        }
    }

    this.rotateClockwise = function(){
        this.setRotation(this.rotationDeg + 90);
        return this.rotationDeg;
    }

    this.setResolution = function(w, h){
        const width = parseInt(w, 10);
        const height = parseInt(h, 10);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return;
        }
        this.videoResolution = [width, height];
        this.remoteVideoElem.attr('width', width).attr('height', height);
        $('#deviceGestures')
            .attr('data-video-width', width)
            .attr('data-video-height', height);
        this._applyLayout();
    }

    this.ensureVideoPlayback = function () {
        const video = this.remoteVideoElem.get(0);
        if (!video) {
            return;
        }

        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        const tryPlay = function (left) {
            if (left <= 0 || !video.srcObject) {
                return;
            }
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(function (err) {
                    console.debug('video: autoplay retry needed', err);
                    setTimeout(function () {
                        tryPlay(left - 1);
                    }, obj.PLAY_RETRY_DELAY_MS);
                });
            }
        };

        tryPlay(this.PLAY_RETRY_COUNT);
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
                this.ensureVideoPlayback();
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
            // Reset so the full retry cycle runs again — the Android side may take
            // a long time to start streaming (e.g., waiting for MediaProjection
            // permission on a locked device), so we must keep trying indefinitely.
            self.watchRetryCount = 0;
            self.watchRestartAttempted = false;
            self.sendWatchRequest();
            self.scheduleWatchRetry();
        }, 3000);
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
        this.ensureVideoPlayback();
    }

    this.remoteVideoElem.on("playing", function (e) {
        console.debug('video: playing event', e);

        if (obj.getStreamVideotracks().length > 0) {
            obj.videoStats.start();
            remoteVideoElem = obj.remoteVideoElem.get(0);
            // Keep the device-reported resolution when available. Falling back to
            // decoded video dimensions can flip orientation on some browsers/devices.
            if (!obj.videoResolution || obj.videoResolution.length !== 2) {
                obj.setResolution(remoteVideoElem.videoWidth, remoteVideoElem.videoHeight);
            }
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

    this.setRotation(0);
}
