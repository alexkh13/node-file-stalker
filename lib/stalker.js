const fs = require('fs');
const chokidar = require('chokidar');
const path = require('path');
const crypto = require('crypto');
const redis = require('redis');
const readline = require('readline');
const EventEmitter = require('events');
const requester = require('./requester');
const resolver = require('./resolver');

class Stalker extends EventEmitter {

    constructor(options) {
        super();

        let listPath = options.listPath;
        let redisPrefix = options.redisPrefix || 'cc';
        let interval = options.interval || 8.64e+7; // 1 day

        this._watcher = chokidar.watch(options.listPath);
        this._files = {};
        this._sources = [];
        this._options = { listPath, redisPrefix };
        this._redisClient = redis.createClient(options.redis);

        this._refreshSources();

        this._watcher.on('change', async (filePath) => {
            if (filePath === options.listPath) {
                await this._refreshSources();
                this._processAll();
            }
            else {
                let source = this._files[filePath];
                if (source) {
                    this._process(source);
                }
            }
        });

        this._interval = setInterval(() => {
            this._sources.forEach((source) => {
                switch(source.type) {
                    case 'REMOTE':
                        this._process(source);
                }
            })
        }, interval);

        this._processAll();
    }

    close() {
        this._watcher.close();
        clearInterval(this._interval);
    }

    _refreshSources() {
        return new Promise((resolve) => {

            let oldSources = {};

            this._sources.forEach((source) => {
                oldSources[source.url] = source;
                switch(source.type) {
                    case 'FILE':
                        this._watcher.unwatch(source.filePath);
                        delete this._files[source.filePath];
                }
            });

            this._sources.length = 0;

            let lineReader = readline.createInterface({
                input: fs.createReadStream(this._options.listPath)
            });

            lineReader.on('line', (line) => {
                if (/^#/.test(line)) return;
                let [resolverName, url] = line.split(/[\s]+/);
                let source = { resolverName, url };
                source.type = this._getSourceType(source);
                if (source.type === 'FILE') {
                    let file = source.url.replace(/^file:\/\//,'');
                    let dir = path.dirname(this._options.listPath);
                    source.filePath = path.resolve(dir, file);
                    this._watcher.add(source.filePath);
                    this._files[source.filePath] = source;
                }
                this._sources.push(source);
            });

            lineReader.on('close', async () => {

                this._sources.forEach((source) => {
                    delete oldSources[source.url];
                });

                for(let url in oldSources) {
                    await this._clearSource(oldSources[url]);
                }

                resolve(this._sources);
            })
        });
    }

    _processAll() {
        return this._sources.map((source) => this._process(source));
    }

    async _process(source) {

        let rawData = await this._getSourceData(source);
        let newHash = await this._getNewHash(source, rawData);

        if (newHash) {

            let resolvedData = await resolver.resolve(source.resolverName, rawData);
            this.emit('resolve', resolvedData, source);

            this._getAdded(source, resolvedData).then((added) => {
                if (added.length) {
                    this.emit('add', added, source);
                }
            });

            this._getRemoved(source, resolvedData).then((removed) => {
                if (removed.length) {
                    this.emit('remove', removed, source);
                }
            });

            let key = this._key(source, 'id');
            this._redisCall('hset', key, 'hash', newHash);
        }

    }

    _getSourceData(source) {
        switch(source.type) {
            case 'FILE':
                return fs.readFileSync(source.filePath, {encoding:'utf8'});
            case 'REMOTE':
                return requester({ url: source.url });
        }
    }

    _getSourceType(source) {
        if (/^file:/.test(source.url)) {
            return 'FILE';
        }
        else {
            return 'REMOTE';
        }
    }

    async _getNewHash(source, data) {
        let newHash = md5hash(data);
        let hkey = this._key(source, 'id');
        let hash = await this._redisCall('hget', hkey, 'hash');
        if (!hash || hash !== newHash) {
            return newHash;
        }
        else {
            return false;
        }
    }

    async _getAdded(source, keys) {

        let hkey = this._key(source, 'keys');
        let values = await this._redisCall.apply(this, ['hmget', hkey].concat(keys));
        let added = values.map((value, index) => ({
            key: keys[index],
            value: value
        }));

        added = added.filter((o) => !o.value);

        let setargs = [];

        let now = +new Date();

        let map = {};

        added.forEach((added) => {
            map[added.key] = true;
            setargs.push(added.key);
            setargs.push(now);
        });

        if (setargs.length) {
            await this._redisCall.apply(this, ['hmset', hkey].concat(setargs));
        }

        return Object.keys(map);
    }

    async _getRemoved(source, keys) {

        let hkey = this._key(source, 'keys');
        let ckeys = await this._redisCall('hkeys', hkey);

        let map = {};

        ckeys.forEach((key) => {
            map[key] = true;
        });

        keys.forEach((key) => delete map[key]);

        let removed = Object.keys(map);

        if (removed.length) {
            await this._redisCall.apply(this, ['hdel', hkey].concat(removed));
        }

        return removed;
    }

    async _clearSource(source) {
        await this._redisCall('del', this._key(source, 'id'));
        await this._redisCall('del', this._key(source, 'keys'));
    };

    _redisCall(method, ...args) {
        return new Promise((resolve) => {
            this._redisClient[method].apply(this._redisClient, args.concat([(err, reply) => {
                if (err) throw err;
                resolve(reply);
            }]));
        });
    }

    _key(source, type) {
        return [this._options.redisPrefix, source.url, type].join(':');
    }
}

function md5hash(str) {
    return crypto.createHash('md5').update(str).digest("hex");
}

module.exports = Stalker;