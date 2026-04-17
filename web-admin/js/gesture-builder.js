function GestureBuilder(divGesture, remoteChat){
    this.divGesture = divGesture;
    this.remoteChat = remoteChat;

    this.swipeStartPosition = [0, 0];
    this.swipeStartMillis = 0;
    this.swipeInProcess = false;
    this.activePointerId = null;

    let obj = this;  // for event handlers

    this.extractPosition = function(e){
        const original = e.originalEvent || e;
        const point = (original.changedTouches && original.changedTouches.length > 0)
            ? original.changedTouches[0]
            : (original.touches && original.touches.length > 0)
                ? original.touches[0]
                : original;

        const rect = this.divGesture.get(0).getBoundingClientRect();
        let x = point.clientX - rect.left;
        let y = point.clientY - rect.top;

        x = Math.max(0, Math.min(rect.width, x));
        y = Math.max(0, Math.min(rect.height, y));

        return [Math.round(x), Math.round(y)];
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
