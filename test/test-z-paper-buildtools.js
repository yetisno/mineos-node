var fs = require('fs-extra');
var path = require('path');
var os = require('os');
var events = require('events');
var server = require('../server');
var paperManifest = require('../profiles.d/paperspigot').profile;
var test = exports;

var BASE_DIR = path.join(os.tmpdir(), 'mineos-paper-buildtools-test');

function withFakeAxios(fakeAxios, fn) {
  var axiosPath = require.resolve('axios');
  var templatePath = require.resolve('../profiles.d/papertemplate');
  var originalAxios = require(axiosPath);

  require.cache[axiosPath].exports = fakeAxios;
  delete require.cache[templatePath];

  try {
    fn(require('../profiles.d/papertemplate'));
  } finally {
    require.cache[axiosPath].exports = originalAxios;
    delete require.cache[templatePath];
  }
}

function withSocketIo() {
  var socketIo = new events.EventEmitter();
  socketIo.namespaces = {};
  socketIo.of = function(name) {
    if (!this.namespaces[name])
      this.namespaces[name] = new events.EventEmitter();

    return this.namespaces[name];
  };

  return socketIo;
}

test.setUp = function(callback) {
  fs.removeSync(BASE_DIR);
  fs.ensureDirSync(path.join(BASE_DIR, 'profiles'));
  callback();
}

test.tearDown = function(callback) {
  fs.removeSync(BASE_DIR);
  callback();
}

test.paper_profile_manifest_uses_public_papermc_api = function(test) {
  test.equal(paperManifest.request_args.url, 'https://api.papermc.io/v2/projects/paper/');
  test.done();
}

test.paper_profile_skips_versions_without_build_metadata = function(test) {
  function fakeAxios(args) {
    if (args.url == 'https://api.papermc.io/v2/projects/paper/versions/1.21.11-rc1/')
      return Promise.reject(new Error('Request failed with status code 404'));

    if (args.url == 'https://api.papermc.io/v2/projects/paper/versions/1.21.11/')
      return Promise.resolve({ data: { builds: [69] } });

    return Promise.reject(new Error('unexpected URL: ' + args.url));
  }

  withFakeAxios(fakeAxios, function(papertemplate) {
    var manifest = papertemplate('paper');

    manifest.handler(BASE_DIR, { versions: ['1.21.11-rc1', '1.21.11'] }, function(err, profiles) {
      if (err) {
        test.ifError(err);
        test.done();
        return;
      }

      test.equal(profiles.length, 1);
      test.equal(profiles[0].id, 'Paper-1.21.11-69');
      test.equal(profiles[0].filename, 'paper-1.21.11-69.jar');
      test.done();
    });
  });
}

test.send_spigot_list_includes_paper_builds = function(test) {
  var profileDir = path.join(BASE_DIR, 'profiles');
  fs.ensureDirSync(path.join(profileDir, 'spigot_1.21.11'));
  fs.ensureDirSync(path.join(profileDir, 'paper_1.21.11'));
  fs.writeFileSync(path.join(profileDir, 'spigot_1.21.11', 'spigot-1.21.11.jar'), '');
  fs.writeFileSync(path.join(profileDir, 'paper_1.21.11', 'paper-1.21.11-69.jar'), '');

  var frontEnd = new events.EventEmitter();
  var backend = server.backend(BASE_DIR, frontEnd);

  frontEnd.once('spigot_list', function(list) {
    test.ok(list['spigot_1.21.11']);
    test.ok(list['paper_1.21.11']);
    test.deepEqual(list['paper_1.21.11'].jarfiles, ['paper-1.21.11-69.jar']);
    backend.shutdown();
    test.done();
  });

  backend.send_spigot_list();
}

test.buildtools_page_has_paper_navigation_and_actions = function(test) {
  var html = fs.readFileSync(path.join(__dirname, '..', 'html', 'index.html'), 'utf8');

  test.ok(/change_page\('buildtools'\)[\s\S]*<span class="text">Paper<\/span>/.test(html));
  test.ok(html.indexOf("host_command('build_jar', {builder: paper_builder, version: jar.id})") >= 0);
  test.ok(html.indexOf('ng-disabled="!paper_versions[jar.id]"') >= 0);
  test.ok(html.indexOf("type: 'paper'") >= 0);
  test.ok(html.indexOf("spigot_list['paper_' + jar.id].jarfiles.length") >= 0);
  test.done();
}

test.dockerfiles_map_armhf_to_node_armv7l = function(test) {
  var dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  var dockerfileDev = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile.dev'), 'utf8');

  test.ok(dockerfile.indexOf('armhf) node_arch=armv7l') >= 0);
  test.ok(dockerfile.indexOf('ln -sf /usr/local/bin/node /usr/bin/node') >= 0);
  test.equal((dockerfileDev.match(/armhf\) node_arch=armv7l/g) || []).length, 2);
  test.equal((dockerfileDev.match(/ln -sf \/usr\/local\/bin\/node \/usr\/bin\/node/g) || []).length, 2);
  test.done();
}

test.dockerhub_references_use_lts_java_image = function(test) {
  var compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  var docsIndex = fs.readFileSync(path.join(__dirname, '..', 'docs', 'README.md'), 'utf8');
  var dockerDocs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'install', 'docker.md'), 'utf8');

  test.ok(compose.indexOf('image: yetisno/mineos-lts-java:latest') >= 0);
  test.ok(docsIndex.indexOf('https://hub.docker.com/repository/docker/yetisno/mineos-lts-java') >= 0);
  test.ok(dockerDocs.indexOf('docker pull yetisno/mineos-lts-java') >= 0);
  test.ok(dockerDocs.indexOf('yetisno/mineos-lts-java:latest') >= 0);
  test.ok(dockerDocs.indexOf('export USER_NAME=mc') >= 0);
  test.ok(dockerDocs.indexOf('-e USER_NAME') >= 0);
  test.ok(dockerDocs.indexOf('-e USER_PASSWORD') >= 0);
  test.equal(compose.indexOf('hexparrot/mineos'), -1);
  test.equal(dockerDocs.indexOf('hexparrot/mineos'), -1);
  test.equal(dockerDocs.indexOf('MINEOS_UN'), -1);
  test.equal(dockerDocs.indexOf('MINEOS_PW'), -1);
  test.done();
}

test.paper_build_backend_uses_safe_temp_download_and_cleanup = function(test) {
  var source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test.ok(source.indexOf('function download_paper_jar(version, working_dir, callback)') >= 0);
  test.ok(source.indexOf('function paper_download_paths(version, build, working_dir)') >= 0);
  test.ok(source.indexOf('function install_paper_download(paths, callback)') >= 0);
  test.ok(source.indexOf('function stream_paper_download(download_url, temp_path, callback)') >= 0);
  test.ok(source.indexOf("temp_path: path.join(temp_dir, filename)") >= 0);
  test.ok(source.indexOf("fs.move(paths.temp_path, paths.staged_path, { overwrite: true }") >= 0);
  test.ok(source.indexOf('fs.createWriteStream(temp_path)') >= 0);
  test.ok(source.indexOf("cleanup_paper_download(paths.temp_dir, function() { callback(download_err); });") >= 0);
  test.ok(source.indexOf("download_paper_jar(args.version, working_dir, cb)") >= 0);
  test.ok(source.indexOf("PaperMC download returned HTTP") >= 0);
  test.ok(source.indexOf("!body || typeof body != 'object' || !body.builds || !body.builds.length") >= 0);
  test.ok(source.indexOf("filename.match(/.+\\.jar/i) && filename != path.basename(dest_path)") >= 0);
  test.done();
}

test.backend_lan_broadcaster_ignores_callbacks_after_shutdown = function(test) {
  var source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  var callbackStart = source.indexOf('broadcast_to_lan(function(msg, server_ip) {');
  var callbackMsg = source.indexOf('if (msg) {', callbackStart);
  var callbackGuard = source.indexOf('if (broadcaster_stopped)', callbackStart);
  var listeningStart = source.indexOf('on("listening", function () {', callbackStart);
  var listeningSend = source.indexOf('setBroadcast(true)', listeningStart);
  var listeningGuard = source.indexOf('if (broadcaster_stopped)', listeningStart);

  test.ok(callbackStart >= 0);
  test.ok(callbackGuard > callbackStart);
  test.ok(callbackGuard < callbackMsg);
  test.ok(listeningStart > callbackStart);
  test.ok(listeningGuard > listeningStart);
  test.ok(listeningGuard < listeningSend);
  test.done();
}

test.backend_shutdown_closes_server_file_watchers_after_file_events = function(test) {
  var serverName = 'paper_smoke';
  var serverDir = path.join(BASE_DIR, 'servers', serverName);
  var socketIo = withSocketIo();
  fs.ensureDirSync(serverDir);

  var backend = server.backend(BASE_DIR, socketIo, { base_directory: BASE_DIR });
  fs.writeFileSync(path.join(serverDir, 'server.properties'), 'motd=paper smoke\n');

  setTimeout(function() {
    backend.shutdown();

    setTimeout(function() {
      var watchers = process._getActiveHandles().filter(function(handle) {
        return handle.constructor && handle.constructor.name == 'FSWatcher';
      });

      test.equal(watchers.length, 0);
      test.done();
    }, 100);
  }, 300);
}
