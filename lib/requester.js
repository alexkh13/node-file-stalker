const request = require('request').defaults({
    json: true
});

module.exports = function(options) {
    return new Promise((resolve, reject) => {
        request(options, (err, response, body) => {
            if (err) throw err;
            if (response.statusCode === 200) {
                resolve(body);
            }
            else {
                reject(body);
            }
        });
    });
};