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
    this.stallDetectorId = null;
    this.controlledStopInProgress = false;
    this.MAX_WATCH_RETRIES = 8;
    this.WATCH_RETRY_DELAY_MS = 1500;
    this.PLAY_RETRY_DELAY_MS = 250;
    this.PLAY_RETRY_COUNT = 8;
    this.rotationDeg = 0;
    this.touchRotationDeg = 0;
    this.baseTouchRotationDeg = 0;
    this._currentScale = 1;

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
        $('#btnRotateVideo').text('Rotate View (' + normalized + '°)');
        this._applyLayout();
    }

    this.setTouchRotation = function(deg){
        var normalized = ((parseInt(deg, 10) || 0) % 360 + 360) % 360;
        this.baseTouchRotationDeg = normalized;
        this._applyGestureOverlayLayout();
    }

    // Resize #windowStream and reposition the video so the container matches the
    // visual (post-rotation) dimensions — prevents the black-area gap that appears
    // when CSS rotate() is used without reflowing the parent.
    // When the rotated width (vh) exceeds the available container width the video
    // is scaled down uniformly so nothing gets cropped.
    this._applyLayout = function() {
        var vw = parseInt(this.remoteVideoElem.attr('width') || 0);
        var vh = parseInt(this.remoteVideoElem.attr('height') || 0);
        if (!vw || !vh) { return; }
        var rot = this.rotationDeg;
        if (rot === 90 || rot === 270) {
            // After rotation the visual width = vh (the portrait height).
            // Scale down if that exceeds the available container width so the
            // full frame is visible without horizontal overflow / cropping.
            var mainWindow = document.getElementById('main-window');
            var availWidth = (mainWindow && mainWindow.clientWidth > 0)
                ? mainWindow.clientWidth : vh;
            var scale = Math.min(1, availWidth / vh);
            var scaledVW = Math.round(vw * scale);
            var scaledVH = Math.round(vh * scale);
            var shift = (scaledVH - scaledVW) / 2;
            this._currentScale = scale;
            $('#windowStream').css({ width: scaledVH + 'px', height: scaledVW + 'px', overflow: 'hidden' });
            this.remoteVideoElem.css({
                position: 'absolute', left: shift + 'px', top: -shift + 'px',
                width: scaledVW + 'px', height: scaledVH + 'px'
            });
        } else {
            this._currentScale = 1;
            $('#windowStream').css({ width: '', height: '', overflow: '' });
            this.remoteVideoElem.css({ position: '', left: '', top: '', width: '', height: '' });
        }
        this._applyGestureOverlayLayout();
    }

    this._applyGestureOverlayLayout = function() {
        var gestureElem = $('#deviceGestures');
        var vw = parseFloat(this.remoteVideoElem.attr('width') || this.remoteVideoElem.width() || 0);
        var vh = parseFloat(this.remoteVideoElem.attr('height') || this.remoteVideoElem.height() || 0);
        var sourceWidth = this.videoResolution ? this.videoResolution[0] : vw;
        var sourceHeight = this.videoResolution ? this.videoResolution[1] : vh;
        var touchRotation = (this.baseTouchRotationDeg + this.rotationDeg) % 360;
        this.touchRotationDeg = touchRotation;
        $('#deviceGestures').attr('data-touch-rotation', touchRotation);

        if (!vw || !vh || !sourceWidth || !sourceHeight) {
            return;
        }

        if (this.baseTouchRotationDeg === 90 || this.baseTouchRotationDeg === 270) {
            var contentAspect = sourceHeight / sourceWidth;
            var videoAspect = vw / vh;
            var contentWidth = vw;
            var contentHeight = vh;

            if (videoAspect > contentAspect) {
                contentWidth = vh * contentAspect;
            } else {
                contentHeight = vw / contentAspect;
            }

            var left = (vw - contentWidth) / 2;
            var top = (vh - contentHeight) / 2;
            var overlayLeft = left;
            var overlayTop = top;
            var overlayWidth = contentWidth;
            var overlayHeight = contentHeight;
            var visualWidth = vw;
            var visualHeight = vh;

            if (this.rotationDeg === 90 || this.rotationDeg === 270) {
                visualWidth = vh;
                visualHeight = vw;
                overlayWidth = contentHeight;
                overlayHeight = contentWidth;

                if (this.rotationDeg === 90) {
                    overlayLeft = vh - top - contentHeight;
                    overlayTop = left;
                } else {
                    overlayLeft = top;
                    overlayTop = vw - left - contentWidth;
                }
            } else if (this.rotationDeg === 180) {
                overlayLeft = vw - left - contentWidth;
                overlayTop = vh - top - contentHeight;
            }

            var s = this._currentScale || 1;
            gestureElem.css({
                left: (overlayLeft * s) + 'px',
                top: (overlayTop * s) + 'px',
                width: (overlayWidth * s) + 'px',
                height: (overlayHeight * s) + 'px',
                right: 'auto',
                bottom: 'auto',
                outline: '2px dashed rgba(255, 0, 0, 0.85)',
                backgroundColor: 'rgba(0, 0, 0, 0)'
            });
            console.info('touch-map: overlay layout',
                'left=' + Math.round(overlayLeft),
                'top=' + Math.round(overlayTop),
                'size=' + Math.round(overlayWidth) + 'x' + Math.round(overlayHeight),
                'baseTouchRotation=' + this.baseTouchRotationDeg,
                'touchRotation=' + touchRotation,
                'viewRotation=' + this.rotationDeg,
                'video=' + Math.round(vw) + 'x' + Math.round(vh),
                'visual=' + Math.round(visualWidth) + 'x' + Math.round(visualHeight),
                'source=' + sourceWidth + 'x' + sourceHeight);
        } else {
            gestureElem.css({
                left: '0',
                top: '0',
                width: '100%',
                height: '100%',
                right: '0',
                bottom: '0',
                outline: '2px dashed rgba(255, 0, 0, 0.65)',
                backgroundColor: 'rgba(0, 0, 0, 0)'
            });
            console.info('touch-map: overlay layout',
                'left=0',
                'top=0',
                'size=100%',
                'baseTouchRotation=' + this.baseTouchRotationDeg,
                'touchRotation=' + touchRotation,
                'viewRotation=' + this.rotationDeg,
                'video=' + Math.round(vw) + 'x' + Math.round(vh),
                'source=' + sourceWidth + 'x' + sourceHeight);
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

    this.syncGestureSourceFromDecoded = function(videoElem) {
        if (!videoElem) {
            return;
        }
        const decodedWidth = parseInt(videoElem.videoWidth, 10);
        const decodedHeight = parseInt(videoElem.videoHeight, 10);
        if (!Number.isFinite(decodedWidth) || !Number.isFinite(decodedHeight)
            || decodedWidth <= 0 || decodedHeight <= 0) {
            return;
        }
        $('#deviceGestures')
            .attr('data-video-width', decodedWidth)
            .attr('data-video-height', decodedHeight);
        this.videoResolution = [decodedWidth, decodedHeight];
        this._applyGestureOverlayLayout();
    }

    this.ensureVideoPlayback = function () {
        const video = this.remoteVideoElem.get(0);
        if (!video) {
            console.warn('video: ensureVideoPlayback - no video element found');
            return;
        }
        if (!video.srcObject) {
            console.warn('video: ensureVideoPlayback - srcObject is null, skipping play');
            return;
        }

        console.info('video: ensureVideoPlayback called, readyState=' + video.readyState + ', paused=' + video.paused + ', videoWidth=' + video.videoWidth + 'x' + video.videoHeight);

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
                        console.info('video: play() succeeded');
                    })
                    .catch(function (err) {
                        console.warn('video: play() failed (' + err.name + ': ' + err.message + '), retrying in ' + obj.PLAY_RETRY_DELAY_MS + 'ms');
                        setTimeout(function () {
                            tryPlay(left - 1);
                        }, obj.PLAY_RETRY_DELAY_MS);
                    });
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
            console.info('streaming: setStream proceeding - ' + this.getStreamVideotracks().length + ' video track(s)');
            var videoElem = this.remoteVideoElem.get(0);
            if (!videoElem) {
                console.error('streaming: setStream FATAL - video element not found in DOM, cannot attach stream');
                return;
            }
            console.info('video elem: tag=' + videoElem.tagName + ', id=' + videoElem.id + ', display=' + window.getComputedStyle(videoElem).display + ', width=' + videoElem.clientWidth + 'x' + videoElem.clientHeight);

            // Log video track muted state — muted=true means no RTP data yet
            var tracks = this.stream.getVideoTracks();
            for (var i = 0; i < tracks.length; i++) {
                var t = tracks[i];
                console.info('video track[' + i + ']: enabled=' + t.enabled + ', muted=' + t.muted + ', readyState=' + t.readyState + ', label=' + t.label);
                if (t.muted) {
                    console.warn('video track[' + i + '] is MUTED (no RTP data yet) - video will appear when Android starts streaming');
                }
            }

            this.cancelWatchRetry();
            if (streamChanged) {
                console.info('streaming: attaching stream to video element');
                try {
                    Janus.attachMediaStream(videoElem, this.stream);
                    console.info('video elem after attach: srcObject=' + (videoElem.srcObject ? 'SET' : 'NULL') + ', srcObjectTracks=' + (videoElem.srcObject ? videoElem.srcObject.getTracks().length : 0));
                } catch (e) {
                    console.error('streaming: EXCEPTION in Janus.attachMediaStream: ' + e.message, e);
                }
                this.ensureVideoPlayback();
                this.startStallDetector();
            } else {
                console.info('streaming: stream unchanged, skipping reattach');
                this.ensureVideoPlayback();
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
        if (this.getStreamVideotracks().length === 0) return false;
        // A track exists but may carry no data yet (muted, readyState=0).
        // Only consider it truly active once the video element has received frames.
        var v = this.remoteVideoElem.get(0);
        return v && (v.readyState > 0 || v.videoWidth > 0);
    }

    this.cancelStallDetector = function () {
        if (this.stallDetectorId !== null) {
            clearInterval(this.stallDetectorId);
            this.stallDetectorId = null;
        }
    }

    // Send a "stop" to Janus without triggering the full stopStreaming() teardown.
    // Sets controlledStopInProgress=true so onmessage can distinguish this from
    // a server-initiated stop.
    this.sendControlledStop = function () {
        if (!this.streaming) return;
        this.controlledStopInProgress = true;
        console.info('streaming: sending controlled stop (restart in progress)');
        this.streaming.send({"message": {"request": "stop"}});
    }

    this.consumeControlledStop = function () {
        var was = this.controlledStopInProgress;
        this.controlledStopInProgress = false;
        return was;
    }

    this.startStallDetector = function () {
        this.cancelStallDetector();
        var self = this;
        var pollCount = 0;
        var STALL_TIMEOUT_POLLS = 20;  // 20 x 3s = 60s - H.264 decoder may take time to start
        this.stallDetectorId = setInterval(function () {
            var v = self.remoteVideoElem.get(0);
            if (!v || !v.srcObject) {
                self.cancelStallDetector();
                return;
            }
            
            // Check if we have actual decoded frames
            if (v.readyState > 0 || v.videoWidth > 0) {
                console.info('video: stall detector - decoder started (readyState=' + v.readyState + ', videoWidth=' + v.videoWidth + '), stopping detector');
                self.cancelStallDetector();
                return;
            }
            
            // Check if RTP data is flowing (track enabled and unmuted)
            var tracks = self.getStreamVideotracks();
            var hasRtpData = false;
            for (var i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled && !tracks[i].muted) {
                    hasRtpData = true;
                    break;
                }
            }
            
            pollCount++;
            var status = hasRtpData ? 'RTP flowing, awaiting decoder' : 'no RTP, no decoder';
            console.debug('video: stall detector poll ' + pollCount + '/' + STALL_TIMEOUT_POLLS + ' - readyState=' + v.readyState + ', videoWidth=' + v.videoWidth + ', ' + status);
            
            // After 10 seconds (poll 4), notify user that H.264 decoder is initializing
            if (hasRtpData && pollCount === 4) {
                console.info('video: H.264 decoder initializing (slow)... RTP is flowing, please wait');
                if ($('#streamingStatus').length) {
                    $('#streamingStatus').text('Initializing video decoder...').removeClass('d-none');
                }
            }
            
            if (pollCount >= STALL_TIMEOUT_POLLS) {
                // If RTP is flowing, let it wait more. Only give up if RTP stopped.
                if (hasRtpData) {
                    console.warn('video: stall detector - RTP still flowing after ' + (STALL_TIMEOUT_POLLS * 3) + 's, extending timeout (decoder may be slow)');
                    pollCount = 0;  // reset counter and keep waiting
                    return;
                }
                console.warn('video: stall detector - no data after ' + (STALL_TIMEOUT_POLLS * 3) + 's, resubscribing');
                self.cancelStallDetector();
                // Send controlled stop then re-watch to force Janus to renegotiate
                self.sendControlledStop();
                setTimeout(function () {
                    self.watchRetryCount = 0;
                    self.watchRestartAttempted = false;
                    self.sendWatchRequest();
                    self.scheduleWatchRetry();
                }, 1500);
            }
        }, 3000);
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
        this.sendControlledStop();

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
            obj.cancelStallDetector();
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
        this.cancelStallDetector();
        this.streaming.send({"message": {"request": "stop"}});
        this.streaming.hangup();
        this.cleanup();
    }

    this.cleanup = function () {
        console.info('video: cleanup ..');
        this.cancelWatchRetry();
        this.cancelStallDetector();
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
            obj.syncGestureSourceFromDecoded(videoElement);
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
            obj.syncGestureSourceFromDecoded(videoElement);
        });
        videoElement.addEventListener('volumechange', eventLog('volumechange'));
    } else {
        console.warn('video: could not attach event listeners - video element not found');
    }

    this.setRotation(0);
}
