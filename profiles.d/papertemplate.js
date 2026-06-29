var path = require('path');
var fs = require('fs-extra');
var profile = require('./template');
var axios = require('axios');
var API_BASE = 'https://api.papermc.io/v2/projects';

function request_version_builds(lowername, version) {
  return axios({ url: `${API_BASE}/${lowername}/versions/${version}/`}).then(function(response) {
    return {
      version: version,
      builds: response.data && response.data.builds
    };
  }).catch(function(err) {
    return {
      version: version,
      error: err
    };
  });
}

function has_downloadable_build(response) {
  return response.builds && response.builds.length;
}

function build_profile_item(lowername, titlename, profile_dir, response, weight) {
  var build = response.builds[response.builds.length - 1];
  var ver = response.version;
  var item = new profile();
  var filename = `${lowername}-${ver}-${build}.jar`;

  item['id'] = `${titlename}-${ver}-${build}`;
  item['group'] = lowername;
  item['webui_desc'] = `Latest ${titlename} build for ${ver}`;
  item['weight'] = weight;
  item['filename'] = filename;
  item['url'] = `${API_BASE}/${lowername}/versions/${ver}/builds/${build}/downloads/${filename}`;
  item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
  item['version'] = ver;
  item['release_version'] = ver;
  item['type'] = 'release'

  return item;
}

function build_profile_list(lowername, titlename, profile_dir, responses) {
  var weight = 0;

  return responses.filter(has_downloadable_build).map(function(response) {
    return build_profile_item(lowername, titlename, profile_dir, response, weight++);
  });
}

module.exports = function papertemplate (name){
  const lowername = name.toLowerCase();
  const titlename = name.charAt(0).toUpperCase() + lowername.substr(1);

return {
  name: titlename,
  request_args: {
    url: `${API_BASE}/${lowername}/`,
    json: true
  },
  handler: function (profile_dir, body, callback) {
    var versions = (body || {}).versions || [];

    Promise.all(versions.map(function(version) {
      return request_version_builds(lowername, version);
    })).then(function(responses) {
      var p = build_profile_list(lowername, titlename, profile_dir, responses);

      if (versions.length && !p.length)
        throw new Error(`No downloadable ${titlename} builds were found`);

      callback(null, p);
    }).catch(callback);
  } //end handler
}
}
