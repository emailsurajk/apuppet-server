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
            console.warn('video: ensureVideoPlayback - no video element found');
            return;
        }

        console.info('video: ensureVideoPlayback called, srcObject=' + (video.srcObject ? 'SET' : 'NULL') + ', readyState=' + video.readyState + ', networkState=' + video.networkState);

        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;

        const tryPlay = function (left) {
            if (left <= 0 || !video.srcObject) {
                console.debug('video: tryPlay stopping - left=' + left + ', srcObject=' + (video.srcObject ? 'SET' : 'NULL'));
                return;
            }
            console.debug('video: attempting play (tries left=' + left + ')');
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise
                    .then(function() {
                        console.info('video: play() succeeded immediately');
                    })
                    .catch(function (err) {
                        console.debug('video: play() failed, autoplay retry needed. Error: ' + err.message + ' (code=' + err.name + ')');
                        setTimeout(function () {
                            tryPlay(left - 1);
                        }, obj.PLAY_RETRY_DELAY_MS);
                    });
            } else {
                console.debug('video: play() returned non-promise or null');
            }
        };

        tryPlay(this.PLAY_RETRY_COUNT);
    }

    this.setStream = function (stream) {
        var videoTrackCount = (stream ? stream.getVideoTracks().length : 0);
        console.info('streaming: setStream called, stream=' + (!!stream) + ', tracks=' + videoTrackCount + ', streamChanged=' + (this.stream !== stream));
        
        let streamChanged = false;
        if (this.stream !== stream) {
            this.stream = stream;
            streamChanged = true;
        }

        if (this.getStreamVideotracks().length > 0) {
            console.info('streaming: setStream proceeding - stream has ' + this.getStreamVideotracks().length + ' video track(s)');
            var videoElem = this.remoteVideoElem.get(0);
            console.info('video element state: tag=' + (videoElem ? videoElem.tagName : 'NULL') + ', id=' + (videoElem ? videoElem.id : 'NULL'));
            console.info('video element dims: width=' + (videoElem ? videoElem.width : '?') + ', height=' + (videoElem ? videoElem.height : '?') + ', videoWidth=' + (videoElem ? videoElem.videoWidth : '?') + ', videoHeight=' + (videoElem ? videoElem.videoHeight : '?'));
            console.info('video element CSS: display=' + (videoElem ? window.getComputedStyle(videoElem).display : '?') + ', visibility=' + (videoElem ? window.getComputedStyle(videoElem).visibility : '?') + ', opacity=' + (videoElem ? window.getComputedStyle(videoElem).opacity : '?'));
            console.info('#windowStream CSS: display=' + (document.getElementById('windowStream') ? window.getComputedStyle(document.getElementById('windowStream')).display : 'NOT_FOUND'));
            
            this.cancelWatchRetry();
            if (streamChanged) {
                console.info('streaming: stream changed, attaching to video element');
                Janus.attachMediaStream(videoElem, this.stream);
                console.info('video element after attachMediaStream: srcObject=' + (videoElem.srcObject ? 'SET' : 'NULL') + ', tracks=' + (videoElem.srcObject ? videoElem.srcObject.getTracks().length : 0));
                this.ensureVideoPlayback();
            } else {
                console.info('streaming: stream unchanged, skipping reattach');
            }
            this.hasRemoteVideo();
            if (['chrome', 'firefox', 'safari'].indexOf(Janus.webRTCAdapter.browserDetails.browser) >= 0) {
                this.videoStats.start();
            }
        } else {
            console.warn('streaming: setStream - no video tracks in stream, showing loader');
            this.noRemoteVideo();
            this.videoStats.stop();
        }
    }

    this.hasActiveVideoTrack = function () {
        return this.getStreamVideotracks().length > 0;
    }

    this.sendWatchRequest = function () {
        console.debug('streaming: sendWatchRequest called, streaming=' + (!!this.streaming) + ', mountpointId=' + this.mountpointId + ', watchPin=' + this.watchPin);
        if (!this.streaming || !this.mountpointId) {
            console.warn('streaming: sendWatchRequest precondition failed - cannot send (streaming=' + (!!this.streaming) + ', mountpointId=' + this.mountpointId + ')');
            return;
        }
        var body = {"request": "watch", "id": this.mountpointId, "pin": this.watchPin};
        console.info("streaming: sending watch request for mountpoint " + this.mountpointId + " pin=" + this.watchPin);
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
            console.debug('streaming: video track already active, no retry needed');
            return;
        }

        if (this.watchRetryCount >= this.MAX_WATCH_RETRIES) {
            console.warn('streaming: max retries (' + this.MAX_WATCH_RETRIES + ') reached, forcing watch restart');
            this.forceWatchRestartIfNeeded();
            return;
        }

        var self = this;
        this.watchRetryTimeoutId = setTimeout(function () {
            self.watchRetryCount += 1;
            if (self.hasActiveVideoTrack()) {
                console.debug('streaming: video track became active, stopping retries');
                return;
            }
            console.warn("streaming: no video track yet, retrying watch (attempt " + self.watchRetryCount + "/" + self.MAX_WATCH_RETRIES + ") in " + self.WATCH_RETRY_DELAY_MS + "ms");
            self.sendWatchRequest();
            self.scheduleWatchRetry();
        }, this.WATCH_RETRY_DELAY_MS);
    }

    this.forceWatchRestartIfNeeded = function () {
        var streaming = !!this.streaming;
        var videoActive = this.hasActiveVideoTrack();
        var attempted = this.watchRestartAttempted;
        console.debug('streaming: forceWatchRestartIfNeeded check: streaming=' + streaming + ', videoActive=' + videoActive + ', alreadyAttempted=' + attempted);
        
        if (attempted || videoActive || !this.streaming) {
            if (attempted) console.debug('streaming: already attempted restart, skipping');
            if (videoActive) console.debug('streaming: video already active, skipping restart');
            if (!this.streaming) console.warn('streaming: no streaming handle, cannot restart');
            return;
        }
        this.watchRestartAttempted = true;

        console.warn("streaming: retries exhausted, forcing stop/watch restart after 3s pause");
        this.streaming.send({"message": {"request": "stop"}});

        var self = this;
        setTimeout(function () {
            if (self.hasActiveVideoTrack()) {
                console.debug('streaming: video became active during restart pause');
                return;
            }
            // Reset so the full retry cycle runs again — the Android side may take
            // a long time to start streaming (e.g., waiting for MediaProjection
            // permission on a locked device), so we must keep trying indefinitely.
            console.info('streaming: restarting watch cycle (resetting attempt flag)');
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
        console.info("streaming: startStreamMountpoint called with id=" + mountpointId + " pin=" + pin);
        this.mountpointId = mountpointId;
        this.watchPin = pin;
        this.watchRetryCount = 0;
        this.watchRestartAttempted = false;
        console.info("streaming: initializing watch cycle for mountpoint " + mountpointId);
        console.debug('streaming: this.streaming handle is: ' + (this.streaming ? 'SET' : 'NULL'));

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

    // Attach comprehensive video element event listeners for diagnostics
    var videoElement = this.remoteVideoElem.get(0);
    if (videoElement) {
        var eventLog = function(eventName) {
            return function(e) {
                var state = {
                    srcObject: !!videoElement.srcObject,
                    readyState: videoElement.readyState,
                    networkState: videoElement.networkState,
                    bufferedSeconds: videoElement.buffered.length > 0 ? videoElement.buffered.end(0) : 0,
                    currentTime: videoElement.currentTime.toFixed(2),
                    duration: videoElement.duration > 0 ? videoElement.duration.toFixed(2) : 'unknown',
                    paused: videoElement.paused,
                    ended: videoElement.ended,
                    videoWidth: videoElement.videoWidth,
                    videoHeight: videoElement.videoHeight
                };
                console.debug('video: ' + eventName + ' event', state);
            };
        };
        
        videoElement.addEventListener('loadstart', eventLog('loadstart'));
        videoElement.addEventListener('progress', eventLog('progress'));
        videoElement.addEventListener('suspend', eventLog('suspend'));
        videoElement.addEventListener('abort', eventLog('abort'));
        videoElement.addEventListener('error', function(e) {
            console.error('video: error event - code=' + videoElement.error.code + ' msg=' + videoElement.error.message);
        });
        videoElement.addEventListener('emptied', eventLog('emptied'));
        videoElement.addEventListener('loadedmetadata', function(e) {
            console.info('video: loadedmetadata - ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
        });
        videoElement.addEventListener('loadeddata', eventLog('loadeddata'));
        videoElement.addEventListener('canplay', function(e) {
            console.info('video: canplay - ready to play');
        });
        videoElement.addEventListener('canplaythrough', eventLog('canplaythrough'));
        videoElement.addEventListener('playing', function(e) {
            console.info('video: PLAYING - frames flowing to display');
        });
        videoElement.addEventListener('seeking', eventLog('seeking'));
        videoElement.addEventListener('seeked', eventLog('seeked'));
        videoElement.addEventListener('ended', eventLog('ended'));
        videoElement.addEventListener('durationchange', function(e) {
            console.debug('video: durationchange - ' + videoElement.duration);
        });
        videoElement.addEventListener('timeupdate', function(e) {
            // Only log occasionally to avoid spam
            if (Math.floor(videoElement.currentTime * 10) % 10 === 0) {
                console.debug('video: timeupdate - ' + videoElement.currentTime.toFixed(1) + 's');
            }
        });
        videoElement.addEventListener('pause', eventLog('pause'));
        videoElement.addEventListener('play', function(e) {
            console.info('video: play event triggered');
        });
        videoElement.addEventListener('ratechange', eventLog('ratechange'));
        videoElement.addEventListener('resize', function(e) {
            console.info('video: resize - ' + videoElement.videoWidth + 'x' + videoElement.videoHeight);
        });
        videoElement.addEventListener('volumechange', eventLog('volumechange'));
    } else {
        console.warn('video: could not attach event listeners - video element not found');
    }

    this.setRotation(0);
}
