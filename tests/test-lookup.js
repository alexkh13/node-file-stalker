const Stalker = require('..');

let malwareStalker = new Stalker({
    listPath: __dirname + "/lists/list1.txt",
    redis: {
        password: 'foobared'
    }
});


async function test() {
    let results1 = await malwareStalker.lookup("test1");
    let results2 = await malwareStalker.lookup("test2");

    console.log("results1", results1);
    console.log("results2", results2);
}

test();