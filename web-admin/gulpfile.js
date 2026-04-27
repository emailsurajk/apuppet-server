const
    gulp = require('gulp'),
    concat = require('gulp-concat'),
    clean = require('gulp-clean'),
    cleanCSS = require('gulp-clean-css'),
    terser = require('gulp-terser')
;

async function gulpSize(options) {
    const mod = await import('gulp-size');
    return mod.default(options);
}

gulp.task('clean', function(){
    return gulp.src('dist/', {read: false, allowEmpty: true})
        .pipe(clean())
});

gulp.task('styles', async function(){
    const size = await gulpSize({
        title: 'Size of CSS'
    });
    return gulp.src([
        'css/main.css',
        'css/loader.css',
    ], {allowEmpty: true})
        .pipe(concat('app.min.css'))
        .pipe(cleanCSS({
            keepBreaks: true
        }))
        .pipe(size)
        .pipe(gulp.dest('dist/css'));
});

gulp.task('deps-styles', async function(){
    const size = await gulpSize({
        title: 'Size of deps CSS'
    });
    return gulp.src([
        'css/lib/bootstrap-4.3.1.min.css',
        'css/lib/font-awesome-4.6.2.min.css',
        'css/lib/toastr.min.css'
    ], {allowEmpty: true})
        .pipe(concat('deps.min.css'))
        .pipe(cleanCSS({
            keepBreaks: true
        }))
        .pipe(size)
        .pipe(gulp.dest('dist/css'));
});

gulp.task('scripts', async function(){
    const size = await gulpSize({
        title: 'Size of JS'
    });
    return gulp.src([
        'js/janus.js',
        'js/utils.js',
        'js/debug-utils.js',
        'js/cheat-codes.js',
        'js/session-monitoring.js',
        'js/ui.js',
        'js/remote-chat.js',
        'js/commands.js',
        'js/remote-video.js',
        'js/video-stats.js',
        'js/gesture-builder.js',
        'js/remote-admin.js'
    ], {allowEmpty: true})
        .pipe(concat('app.min.js'))
        .pipe(terser())
        .pipe(size)
        .pipe(gulp.dest('dist/js'));
});

gulp.task('deps-scripts', async function() {
    const size = await gulpSize({
        title: 'Size of JS libs'
    });
    return gulp.src([
        'js/lib/jquery-3.3.1.min.js',
        'js/lib/bootstrap-4.3.1.min.js',
        'js/lib/adapter-6.4.0.min.js',
        'js/lib/popper-2.5.3.min.js',
        'js/lib/bootbox-5.4.0.min.js',
        'js/lib/toastr.min.js'
    ], {allowEmpty: true})
        .pipe(concat('deps.min.js'))
        .pipe(terser())
        .pipe(size)
        .pipe(gulp.dest('dist/js'));
});

gulp.task('default', gulp.series('clean', gulp.parallel('styles', 'deps-styles', 'scripts', 'deps-scripts')));
