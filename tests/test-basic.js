const Stalker = require('..');

Stalker.resolver.define('HOSTS_FILE', {
    inherit: 'CONFIG_FILE',
    parse: (line) => line.split(/\s/)[1]
});

let malwareStalker = new Stalker({
    listPath: __dirname + "/lists/list1.txt",
    redis: {
        password: 'foobared'
    }
});

malwareStalker.on('add', (values, source) => {
    console.log(source.url, "added", values)
});

malwareStalker.on('remove', (values, source) => {
    console.log(source.url, "removed", values)
});