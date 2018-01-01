const readline = require('readline');
const stream = require('stream');

let REGEX_COMMENT = /^#/;

module.exports = {
    define,
    resolve
};

const resolvers = {
    'CONFIG_FILE': {
        lines: true,
        exclude: REGEX_COMMENT
    }
};

function define(name, options) {
    if (typeof options === 'function') {
        options = {
            match: options
        }
    }
    if (options.inherit) {
        Object.assign(options, resolvers[options.inherit]);
    }
    resolvers[name] = options;
}

function resolve(resolverName, data) {

    let resolver = resolvers[resolverName];

    if (!resolver) {
        throw new Error("no resolver named " + resolverName);
    }

    return (resolver.lines ? resolveLines : resolveChunk)(resolver, data);
}

function resolveLines(resolver, data) {
    return new Promise((resolve) => {

        let results = [];

        let buf = new Buffer(data);
        let bufferStream = new stream.PassThrough();
        bufferStream.end(buf);

        let lineReader = readline.createInterface({
            input: bufferStream
        });

        lineReader.on('line', (line) => {
            populate(results, resolveChunk(resolver, line));
        });

        lineReader.on('close', () => {
            resolve(results);
        })
    });
}

function resolveChunk(resolver, chunk) {

    let results = [];

    if (resolver.exclude) {
        if (resolver.exclude.test(chunk)) {
            return;
        }
    }

    if (resolver.parse) {
        if (typeof resolver.parse === 'function') {
            populate(results, resolver.parse(chunk));
        }
    }
    else {
        populate(results, chunk);
    }

    return results;
}

function populate(arr, value) {
    if (typeof value === 'undefined') {
        return;
    }
    if (value instanceof Array) {
        value.forEach((v) => arr.push(v));
    }
    else {
        arr.push(value);
    }
}