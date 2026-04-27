function GestureBuilder(divGesture, remoteChat){
    this.divGesture = divGesture;
    this.remoteChat = remoteChat;

    this.swipeStartPosition = [0, 0];
    this.swipeStartMillis = 0;
    this.swipeInProcess = false;
    this.activePointerId = null;
    this.lastMapLogMillis = 0;

    let obj = this;  // for event handlers

    this.extractPosition = function(e){
        const original = e.originalEvent || e;
        const point = (original.changedTouches && original.changedTouches.length > 0)
            ? original.changedTouches[0]
            : (original.touches && original.touches.length > 0)
                ? original.touches[0]
                : original;

        const gestureElem = this.divGesture.get(0);
        const rect = gestureElem.getBoundingClientRect();

        // Map pointer relative to the actual visible Android content, not the
        // full video element which can include black letterbox bars.
        const videoElem = document.getElementById('streamingRemoteVideo');
        let activeRect = rect;
        if (videoElem) {
            const videoRect = videoElem.getBoundingClientRect();
            if (videoRect.width > 0 && videoRect.height > 0) {
                activeRect = this.getActiveContentRect(videoRect);
            }
        }

        let x = point.clientX - activeRect.left;
        let y = point.clientY - activeRect.top;

        x = Math.max(0, Math.min(activeRect.width, x));
        y = Math.max(0, Math.min(activeRect.height, y));

        const mapped = this.mapDisplayToSource(x, y, activeRect.width, activeRect.height);
        const now = Date.now();
        if (now - this.lastMapLogMillis > 250) {
            this.lastMapLogMillis = now;
            console.info('touch-map: pointer',
                'client=' + Math.round(point.clientX) + ',' + Math.round(point.clientY),
                'local=' + Math.round(x) + ',' + Math.round(y),
                'activeRect=' + Math.round(activeRect.left) + ',' + Math.round(activeRect.top) + ' ' + Math.round(activeRect.width) + 'x' + Math.round(activeRect.height),
                'rotation=' + this.getRotation(),
                'source=' + this.getSourceSize(activeRect.width, activeRect.height).join('x'),
                'mapped=' + Math.round(mapped[0]) + ',' + Math.round(mapped[1]));
        }

        return [Math.round(mapped[0]), Math.round(mapped[1])];
    }

    this.getRotation = function(){
        let rotation = parseInt(this.divGesture.attr('data-touch-rotation') || this.divGesture.attr('data-rotation') || '0', 10);
        if (!Number.isFinite(rotation)) {
            rotation = 0;
        }
        rotation = ((rotation % 360) + 360) % 360;
        return rotation;
    }

    this.getActiveContentRect = function(videoRect){
        const rotation = this.getRotation();
        const sourceSize = this.getSourceSize(videoRect.width, videoRect.height);
        const sourceWidth = sourceSize[0];
        const sourceHeight = sourceSize[1];

        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return videoRect;
        }

        const contentAspect = (rotation === 90 || rotation === 270)
            ? sourceHeight / sourceWidth
            : sourceWidth / sourceHeight;
        const videoAspect = videoRect.width / videoRect.height;

        let contentWidth = videoRect.width;
        let contentHeight = videoRect.height;
        if (videoAspect > contentAspect) {
            contentWidth = videoRect.height * contentAspect;
        } else {
            contentHeight = videoRect.width / contentAspect;
        }

        const activeRect = {
            left: videoRect.left + (videoRect.width - contentWidth) / 2,
            top: videoRect.top + (videoRect.height - contentHeight) / 2,
            width: contentWidth,
            height: contentHeight
        };
        console.debug('touch-map: content rect',
            'videoRect=' + Math.round(videoRect.left) + ',' + Math.round(videoRect.top) + ' ' + Math.round(videoRect.width) + 'x' + Math.round(videoRect.height),
            'activeRect=' + Math.round(activeRect.left) + ',' + Math.round(activeRect.top) + ' ' + Math.round(activeRect.width) + 'x' + Math.round(activeRect.height),
            'rotation=' + rotation,
            'source=' + sourceWidth + 'x' + sourceHeight);
        return activeRect;
    }

    this.getSourceSize = function(displayWidth, displayHeight){
        const attrW = parseFloat(this.divGesture.attr('data-video-width'));
        const attrH = parseFloat(this.divGesture.attr('data-video-height'));
        const sourceWidth = Number.isFinite(attrW) && attrW > 0 ? attrW : displayWidth;
        const sourceHeight = Number.isFinite(attrH) && attrH > 0 ? attrH : displayHeight;
        return [sourceWidth, sourceHeight];
    }

    this.mapDisplayToSource = function(x, y, displayWidth, displayHeight){
        if (displayWidth <= 0 || displayHeight <= 0) {
            return [x, y];
        }

        const rotation = this.getRotation();
        const sourceSize = this.getSourceSize(displayWidth, displayHeight);
        const sourceWidth = sourceSize[0];
        const sourceHeight = sourceSize[1];

        const nx = x / displayWidth;
        const ny = y / displayHeight;

        let sx = nx * sourceWidth;
        let sy = ny * sourceHeight;

        if (rotation === 90) {
            sx = ny * sourceWidth;
            sy = (1 - nx) * sourceHeight;
        } else if (rotation === 180) {
            sx = (1 - nx) * sourceWidth;
            sy = (1 - ny) * sourceHeight;
        } else if (rotation === 270) {
            sx = (1 - ny) * sourceWidth;
            sy = nx * sourceHeight;
        }

        sx = Math.max(0, Math.min(sourceWidth, sx));
        sy = Math.max(0, Math.min(sourceHeight, sy));
        return [sx, sy];
    }

    this.gestureStart = function (offsetX, offsetY){
        console.debug('gesture: starts on ', [offsetX, offsetY]);
        this.swipeInProcess = true;
        this.swipeStartMillis = Date.now();
        this.swipeStartPosition = [offsetX, offsetY];
    }

    this.gestureFinish = function (offsetX, offsetY){
        offsetX = offsetX > 0 ? offsetX : 0;
        offsetY = offsetY > 0 ? offsetY : 0;
        if(this.swipeInProcess){
            console.debug('gesture: ends on ', [offsetX, offsetY]);

            var swipeDuration = Date.now() - this.swipeStartMillis;
            var swipeEndPosition = [offsetX, offsetY];
            var swipeType = '', swipeDataToSend = '';
            if (Math.abs(this.swipeStartPosition[0]-swipeEndPosition[0]) < 2 && Math.abs(this.swipeStartPosition[1]-swipeEndPosition[1]) < 2 ){
                swipeDataToSend = `tap,${this.swipeStartPosition[0]},${this.swipeStartPosition[1]},${swipeDuration}`;
            } else {
                swipeDataToSend = `swipe,${this.swipeStartPosition[0]},${this.swipeStartPosition[1]},${swipeEndPosition[0]},${swipeEndPosition[1]},${swipeDuration}`;
            }
            console.info('touch-map: sending gesture', swipeDataToSend);
            this.remoteChat.sendData(swipeDataToSend);
            this.swipeInProcess = false;
        }
    }

    this.pointerDown = function(e){
        if (e.originalEvent && typeof e.originalEvent.isPrimary !== 'undefined' && !e.originalEvent.isPrimary) {
            return;
        }
        obj.activePointerId = e.originalEvent ? e.originalEvent.pointerId : null;
        const target = obj.divGesture.get(0);
        if (target && target.setPointerCapture && obj.activePointerId !== null) {
            target.setPointerCapture(obj.activePointerId);
        }

        $(e.target).css('cursor', 'pointer');
        const pos = obj.extractPosition(e);
        obj.gestureStart(pos[0], pos[1]);
        e.preventDefault();
    }

    this.pointerUp = function(e){
        if (obj.activePointerId !== null && e.originalEvent && typeof e.originalEvent.pointerId !== 'undefined' && e.originalEvent.pointerId !== obj.activePointerId) {
            return;
        }
        obj.activePointerId = null;
        $(e.target).css('cursor', 'auto');
        const pos = obj.extractPosition(e);
        obj.gestureFinish(pos[0], pos[1]);
        e.preventDefault();
    }

    this.divGesture.on('contextmenu', function(e){
        e.preventDefault();
    });

    if (window.PointerEvent) {
        this.divGesture.on('pointerdown', this.pointerDown)
            .on('pointerup pointercancel pointerleave', this.pointerUp);
    } else {
        this.divGesture.on('mousedown touchstart', function(e){
            $(e.target).css('cursor', 'pointer');
            const pos = obj.extractPosition(e);
            obj.gestureStart(pos[0], pos[1]);
            e.preventDefault();
        }).on('mouseup mouseleave touchend touchcancel', function(e){
            $(e.target).css('cursor', 'auto');
            const pos = obj.extractPosition(e);
            obj.gestureFinish(pos[0], pos[1]);
            e.preventDefault();
        });
    }
}
