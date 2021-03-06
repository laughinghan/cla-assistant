/*global describe, it, beforeEach, afterEach*/

// unit test
var assert = require('assert');
var sinon = require('sinon');

// config
global.config = require('../../../config');

// models
var Repo = require('../../../server/documents/repo').Repo;

//services
var github = require('../../../server/services/github');
var url = require('../../../server/services/url');
var cla = require('../../../server/services/cla');
var repo_service = require('../../../server/services/repo');
var statusService = require('../../../server/services/status');
var prService = require('../../../server/services/pullRequest');
var log = require('../../../server/services/logger');

// Test data
var testData = require('../testData').data;

// api
var cla_api = require('../../../server/api/cla');

describe('', function() {
    var reqArgs;
    var resp;
    var error;
    beforeEach(function() {
        reqArgs = {
            cla: {
                getRepo: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                },
                getGist: {
                    gist: testData.repo_from_db.gist
                }
            }
        };
        resp = {
            cla: {
                getRepo: JSON.parse(JSON.stringify(testData.repo_from_db)), //clone object
                getGist: JSON.parse(JSON.stringify(testData.gist)) //clone object
            },
            github: {
                callPullRequest: [{
                    number: 1
                }, {
                    number: 2
                }],
                callMarkdown: {
                    statusCode: 200,
                    data: {}
                },
                callUser: {
                    id: 1,
                    login: 'one'
                }
            }
        };
        error = {
            cla: {
                getRepo: null,
                getGist: null,
            },
            github: {
                pullReqest: null,
                markdown: null,
                user: null
            }
        };

        sinon.stub(cla, 'getRepo', function(args, cb) {
            assert.deepEqual(args, reqArgs.cla.getRepo);
            cb(error.cla.getRepo, resp.cla.getRepo);
        });

        sinon.stub(cla, 'getGist', function(args, cb) {
            if (args.gist && args.gist.gist_url) {
                assert.equal(args.gist.gist_url, reqArgs.cla.getGist.gist);
            } else {
                assert.equal(args.gist, reqArgs.cla.getGist.gist);
            }
            cb(error.cla.getGist, resp.cla.getGist);
        });

        sinon.stub(github, 'call', function(args, cb) {
            if (args.obj === 'pullRequests') {
                console.log('github call PR');
                assert(args.token);

                cb(error.github.pullReqest, resp.github.callPullRequest);
            } else if (args.obj === 'markdown') {
                cb(error.github.markdown, resp.github.callMarkdown);
            } else if (args.obj === 'user') {
                cb(error.github.markdown, resp.github.callUser);
            }
        });
    });
    afterEach(function() {
        cla.getRepo.restore();
        cla.getGist.restore();
        github.call.restore();
    });
    describe('cla:get', function() {
        it('should get gist and render it with user token', function(it_done) {
            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                },
                user: {
                    token: 'user_token'
                }
            };

            cla_api.get(req, function() {
                assert(cla.getRepo.called);
                assert(github.call.calledWithMatch({ obj: 'markdown', fun: 'render', token: 'user_token' }));
                it_done();
            });
        });

        it('should get gist and render it with repo token', function(it_done) {
            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                }
            };

            cla_api.get(req, function() {
                assert(cla.getRepo.called);
                assert(github.call.calledWithMatch({ obj: 'markdown', fun: 'render', token: testData.repo_from_db.token }));

                it_done();
            });
        });

        it('should get gist and render it without user token', function(it_done) {
            resp.cla.getRepo.token = undefined;

            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                }
            };

            cla_api.get(req, function() {
                assert(cla.getRepo.called);
                assert(github.call.calledWithMatch({ obj: 'markdown', fun: 'render', token: undefined }));

                it_done();
            });
        });

        it('should handle wrong gist url', function(it_done) {

            var repoStub = sinon.stub(Repo, 'findOne', function(args, cb) {
                var repo = {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    gist: '123',
                    token: 'abc'
                };
                cb(null, repo);
            });

            resp.cla.getGist = undefined;
            error.cla.getGist = 'error';

            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                }
            };

            cla_api.get(req, function(err) {
                assert.equal(!!err, true);
                assert(!github.call.called);

                repoStub.restore();
                it_done();
            });

        });

        it('should handle result with no files', function(it_done) {
            resp.cla.getGist.files = undefined;

            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                }
            };

            cla_api.get(req, function() {
                assert(cla.getRepo.called);

                it_done();
            });

        });

        describe('in case of failing github api', function() {
            var githubResponse;
            var req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                },
                user: {
                    token: 'abc'
                }
            };

            beforeEach(function() {
                // sinon.stub(github, 'call', function(args, cb) {
                //     cb(githubError, githubResponse);
                // });
                sinon.stub(log, 'error', function(err) {
                    assert(err);
                });
            });

            afterEach(function() {
                log.error.restore();
                // github.call.restore();
            });

            it('should handle github error', function(it_done) {
                resp.github.callMarkdown = {};
                error.github.markdown = 'any error';
                cla_api.get(req, function(err) {
                    assert(err);
                    it_done();
                });
            });

            it('should handle error stored in response message', function(it_done) {
                resp.github.callMarkdown = {
                    statusCode: 500,
                    message: 'somthing went wrong, e.g. user revoked access rights'
                };
                error.github.markdown = null;
                cla_api.get(req, function(err) {
                    assert.equal(err, resp.github.callMarkdown.message);
                    it_done();
                });
            });

            it('should handle error only if status unequal 200 or there is no response', function(it_done) {
                resp.github.callMarkdown = {
                    statusCode: 200,
                    data: {}
                };
                error.github.markdown = 'any error';

                log.error.restore();
                sinon.stub(log, 'error', function() {
                    assert();
                });

                cla_api.get(req, function(err, res) {

                    assert(res);
                    assert(!err);
                    it_done();
                });
            });
        });


    });

    describe('cla api', function() {
        var req;
        beforeEach(function() {
            req = {
                user: {
                    id: 3,
                    login: 'user'
                },
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    gist: testData.repo_from_db.gist
                }
            };

            sinon.stub(repo_service, 'get', function(args, cb) {
                assert(args);
                cb(null, {
                    gist: testData.repo_from_db.gist,
                    token: 'abc.cla.getAll'
                });
            });

            sinon.stub(statusService, 'update', function(args) {
                assert(args.signed);
            });
            sinon.stub(cla, 'sign', function(args, cb) {
                assert.deepEqual(args, {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    user: 'user',
                    user_id: 3
                });
                cb(null, 'done');
            });
            sinon.stub(cla, 'check', function(args, cb) {
                cb(null, true);
            });
            sinon.stub(prService, 'editComment', function() {});
        });

        afterEach(function() {
            statusService.update.restore();
            repo_service.get.restore();
            cla.check.restore();
            cla.sign.restore();
            prService.editComment.restore();
        });

        it('should call cla service on sign', function(it_done) {

            cla_api.sign(req, function(err) {
                assert.ifError(err);
                assert(cla.sign.called);

                it_done();
            });
        });

        it('should update status of pull request created by user, who signed', function(it_done) {
            cla_api.sign(req, function(err, res) {
                assert.ifError(err);
                assert.ok(res);
                assert(statusService.update.called);

                it_done();
            });
        });

        it('should update status of all open pull requests for the repo', function(it_done) {
            cla_api.sign(req, function(err, res) {
                assert.ifError(err);
                assert.ok(res);
                assert.equal(statusService.update.callCount, 2);
                assert(github.call.calledWithMatch({obj: 'pullRequests', fun: 'getAll'}));
                assert(prService.editComment.called);

                it_done();
            });
        });

        it('should comment with user_map if it is given', function(it_done) {
            cla.check.restore();
            prService.editComment.restore();

            sinon.stub(cla, 'check', function(args, cb) {
                cb(null, true, {
                    signed: [],
                    not_signed: []
                });
            });
            sinon.stub(prService, 'editComment', function(args) {
                assert(args.user_map.signed);
            });

            cla_api.sign(req, function(err, res) {
                assert.ifError(err);
                assert.ok(res);
                assert(github.call.calledWithMatch({obj: 'pullRequests', fun: 'getAll'}));
                assert(statusService.update.called);
                assert(prService.editComment.called);
                it_done();
            });
        });

        it('should handle repos without open pull requests', function(it_done) {
            resp.github.callPullRequest = [];

            cla_api.sign(req, function(err, res) {
                assert.ifError(err);
                assert.ok(res);
                assert(github.call.calledWithMatch({obj: 'pullRequests', fun: 'getAll'}));
                assert(!statusService.update.called);

                it_done();
            });
        });
    });

    describe('cla api', function() {
        var req;
        beforeEach(function() {
            req = {
                user: {
                    id: 3,
                    login: 'user'
                },
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat'
                }
            };
        });

        it('should call cla service on getLastSignature', function(it_done) {
            sinon.stub(cla, 'getLastSignature', function(args, cb) {
                assert.deepEqual(args, {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    user: 'user',
                    gist_url: testData.repo_from_db.gist
                });
                cb(null, {});
            });

            req.args = {
                repo: 'Hello-World',
                owner: 'octocat'
            };
            console.log(req);

            cla_api.getLastSignature(req, function(err) {
                assert.ifError(err);
                assert(cla.getLastSignature.called);

                cla.getLastSignature.restore();
                it_done();
            });
        });

        it('should call cla service on getSignedCLA', function(it_done) {
            sinon.stub(cla, 'getSignedCLA', function(args, cb) {
                assert.deepEqual(args, {
                    user: 'user'
                });
                cb(null, {});
            });

            req.args = {
                user: 'user'
            };

            cla_api.getSignedCLA(req, function(err) {
                assert.ifError(err);
                assert(cla.getSignedCLA.called);

                cla.getSignedCLA.restore();
                it_done();
            });
        });

        it('should call cla service on check', function(it_done) {
            sinon.stub(cla, 'check', function(args, cb) {
                assert.deepEqual(args, {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    user: 'user'
                });
                cb(null, true);
            });

            cla_api.check(req, function(err) {
                assert.ifError(err);
                assert(cla.check.called);

                cla.check.restore();
                it_done();
            });
        });

        it('should call cla service on getAll', function(it_done) {
            req.args.gist = testData.repo_from_db.gist;
            sinon.stub(cla, 'getAll', function(args, cb) {
                assert.deepEqual(args, {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    gist: testData.repo_from_db.gist
                });
                cb(null, []);
            });

            cla_api.getAll(req, function(err) {
                assert.ifError(err);
                assert(cla.getAll.called);

                cla.getAll.restore();
                it_done();
            });
        });

        it('should call cla service on getGist', function(it_done) {
            cla_api.getGist(req, function(err) {
                assert.ifError(err);
                assert(cla.getGist.called);

                it_done();
            });
        });

        it('should call cla service using user token, not repo token', function(it_done) {
            req.args.gist = testData.repo_from_db.gist;
            req.user.token = 'user_token';

            cla_api.getGist(req, function(err) {
                assert.ifError(err);
                assert(cla.getGist.calledWith({
                    token: 'user_token',
                    gist: testData.repo_from_db.gist
                }));

                it_done();
            });
        });

        it('should call cla service getGist with user token even if repo is not linked anymore', function(it_done) {
            req.args.gist = {
                gist_url: testData.repo_from_db.gist
            };
            req.user.token = 'user_token';

            resp.cla.getRepo = null;
            error.cla.getRepo = 'There is no repo.';

            cla_api.getGist(req, function(err) {
                assert.ifError(err);
                assert(cla.getGist.called);

                it_done();
            });
        });

        it('should fail calling cla service getGist with user token even if repo is not linked anymore when no gist is provided', function(it_done) {
            req.user.token = 'user_token';

            resp.cla.getRepo = null;
            error.cla.getRepo = 'There is no repo.';

            cla_api.getGist(req, function(err) {
                assert(err);
                assert(!cla.getGist.called);

                it_done();
            });
        });
    });

    describe('cla:countCLA', function() {
        var req = {};
        beforeEach(function() {
            req.args = {
                repo: 'Hello-World',
                owner: 'octocat'
            };
            resp.cla.getAll = [{}];
            sinon.stub(cla, 'getAll', function(args, cb) {
                assert(args.gist.gist_url);
                assert(args.gist.gist_version);

                cb(error.cla.getAll, resp.cla.getAll);
            });
        });
        afterEach(function() {
            cla.getAll.restore();
        });

        it('should call getAll on countCLA', function(it_done) {
            reqArgs.cla.getRepo.gist = {
                gist_url: testData.repo_from_db.gist,
                gist_version: testData.gist.history[0].version
            };
            req.args.gist = {
                gist_url: testData.repo_from_db.gist,
                gist_version: testData.gist.history[0].version
            };


            cla_api.countCLA(req, function(err, number) {
                assert.ifError(err);
                assert(cla.getAll.called);
                assert.equal(number, 1);

                it_done();
            });
        });
        it('should get gist version if not provided', function(it_done) {
            reqArgs.cla.getRepo.gist = {
                gist_url: testData.repo_from_db.gist
            };
            req.args.gist = {
                gist_url: testData.repo_from_db.gist
            };
            resp.cla.getAll = [{}, {}];


            cla_api.countCLA(req, function(err, number) {
                assert.ifError(err);
                assert(cla.getAll.called);
                assert.equal(number, resp.cla.getAll.length);

                it_done();
            });
        });
        it('should get gist url and version if not provided', function(it_done) {
            resp.cla.getAll = [{}, {}];

            cla_api.countCLA(req, function(err, number) {
                assert.ifError(err);
                assert(cla.getAll.called);
                assert.equal(number, resp.cla.getAll.length);

                it_done();
            });
        });
    });

    describe('cla:upload', function() {
        var req;

        beforeEach(function() {
            reqArgs.cla.sign = {};
            req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    users: ['one']
                },
                user: {
                    token: 'user_token'
                }
            };
            sinon.stub(cla, 'sign', function(args, cb) {
                cb(error.cla.sign, reqArgs.cla.sign);
            });
        });

        afterEach(function() {
            cla.sign.restore();
        });

        it('should silenty exit when no users provided', function(it_done) {
            req.args.users = undefined;

            cla_api.upload(req, function(err, res) {
                assert.equal(err, undefined);
                assert.equal(res, undefined);
                it_done();
            });
        });

        it('should not "sign" cla when github user not found', function(it_done) {
            error.github.callUser = 'not found';
            resp.github.callUser = undefined;

            cla_api.upload(req, function() {
                assert(github.call.calledWith({
                    obj: 'user',
                    fun: 'getFrom',
                    arg: {
                        user: 'one'
                    },
                    token: 'user_token'
                }));
                assert(!cla.sign.called);
                it_done();
            });
        });

        it('should "sign" cla for two users', function(it_done) {
            req.args.users = ['one', 'two'];
            cla_api.upload(req, function() {
                assert(github.call.called);
                assert(cla.sign.calledWith({
                    repo: 'Hello-World',
                    owner: 'octocat',
                    user: 'one',
                    user_id: 1
                }));
                assert(cla.sign.calledTwice);
                it_done();
            });
        });
    });

    describe('cla: validatePullRequests', function() {
        var req;
        beforeEach(function() {
            req = {
                args: {
                    repo: 'Hello-World',
                    owner: 'octocat',
                    token: 'test_token'
                }
            };
            sinon.stub(statusService, 'update', function(args) {
                assert(args.signed);
            });
            sinon.stub(cla, 'check', function(args, cb) {
                cb(null, true);
            });
            sinon.stub(prService, 'editComment', function() {});
        });

        afterEach(function() {
            cla.check.restore();
            statusService.update.restore();
            prService.editComment.restore();
        });
        it('should update all open pull requests', function(it_done) {

            cla_api.validatePullRequests(req, function(err) {
                assert.ifError(err);
                assert.equal(statusService.update.callCount, 2);
                assert(github.call.calledWithMatch({obj: 'pullRequests', fun: 'getAll'}));
                assert(prService.editComment.called);

                it_done();
            });
        });

        it('should update all PRs with users token', function(it_done) {
            req.args.token = undefined;
            req.user = {
                token: 'user_token'
            };
            cla_api.validatePullRequests(req, function(err) {
                assert.ifError(err);
                assert.equal(statusService.update.callCount, 2);
                assert(github.call.calledWithMatch({obj: 'pullRequests', fun: 'getAll'}));
                assert(prService.editComment.called);

                it_done();
            });
        });

        it('should load all PRs if there are more to load', function() {

        });


    });
});