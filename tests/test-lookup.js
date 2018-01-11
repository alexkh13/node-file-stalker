const Stalker = require('..');

Stalker.resolver.define('HOSTS_FILE', {
    inherit: 'CONFIG_FILE',
    parse: (line) => line.split(/\s/)[1]
});

let malwareStalker = new Stalker({
    listPath: __dirname + "/lists/list1",
    redis: {
        password: 'foobared'
    }
});


async function test() {
    let results1 = await malwareStalker.lookup("test1");
    let results2 = await malwareStalker.lookup("test2");

    console.log("test1", results1);
    console.log("test2", results2);
}

test();