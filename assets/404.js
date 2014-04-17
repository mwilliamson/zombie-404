$(document).ready(function() {
    var numberOfKitties = 50;
    
    var hideCursor = function() {
        $("body").css({ cursor: "url(assets/cursor.png), url(assets/transparentCursor.cur), none" });
    };
    
    var showCursor = function() {
        $("body").css({ cursor: "auto" });
    };
    
    var copyAndGrabGameElements = function(originalGame) {
        var game = originalGame.clone();
        $("body").append(game);
        return {
            status: {
                panel: game.find(".statusPanel"),
                zombiesKilled: game.find(".statusZK"),
                kittiesKilled: game.find(".statusKK"),
                kittiesSaved: game.find(".statusKS"),
                health: game.find(".statusHealth"),
                tool: game.find(".status-tool"),
                kittyFeast: game.find(".statusKSnomnomnom")
            },
            game: game,
            gamePanel: game.find(".gamePanel"),
            instructionsPanel: game.find(".instructionsPanel"),
            gameOverPanel: $("#gameOverPanel"),
            board: game.find(".board"),
            player: game.find('.player'),
            torchLight: game.find('.torchLight'),
            torchLightCover: game.find('.torchLightCover'),
            floor: game.find(".floor"),
            statusBar: game.find(".statusBar"),
            message: game.find(".game-message"),
            damageIndicator: game.find(".damage-indicator").find("div"),
            cursor: game.find(".cursor")
        };
    };
    
    var initialiseGameState = function(elements) {
        var Board = Backbone.Model.extend({});
        var board = new Board({
            width: 2000,
            height: 2000
        });
        
        var moveBy = function(offset) {
            var x = this.get("x") + (offset.x || 0);
            x = Math.max(this.get("width") / 2, x);
            x = Math.min(board.get("width") - this.get("width") / 2, x);
            
            var y = this.get("y") + (offset.y || 0);
            y = Math.max(this.get("height") / 2, y);
            y = Math.min(board.get("height") - this.get("height") / 2, y);
        
            this.set({
                x: x,
                y: y
            });
        };
        
        var Player = Backbone.Model.extend({
            doTurn: function() {            
                this.moveBy({
                    x: this.get("velocity").x,
                    y: this.get("velocity").y
                });
            },
            moveBy: moveBy,
            addDirection: function(direction) {
                if (direction.x) {
                    this.get("directions").x = direction.x;
                }
                if (direction.y) {
                    this.get("directions").y = direction.y;
                }
                this.updateVelocity();
            },
            removeDirection: function(direction) {
                if (direction.x) {
                    this.get("directions").x = 0;
                }
                if (direction.y) {
                    this.get("directions").y = 0;
                }
                this.updateVelocity();
            },
            updateVelocity: function() {
                var speed = 15;
                var velocity;
                var directions = this.get("directions");
                if (directions.x !== 0 && directions.y !== 0) {
                    velocity = {
                        x: speed / 1.41 * directions.x,
                        y: speed / 1.41 * directions.y
                    };
                } else {
                    velocity = {
                        x: speed * directions.x,
                        y: speed * directions.y
                    };
                }
                this.set({velocity: velocity}, {silent: true});
            },
            toggleTool: function() {
                if (this.get("tool") === "gun") {
                    this.set({tool: "hand"});
                    return;
                }
                
                if (this.get("tool") === "hand") {
                    this.set({tool: "gun"});
                    return;
                }
            },
            doActionAt: function(gameState, position) {
                if (this.get("tool") === "gun") {
                    gameState.gun.fireAt(this, position);
                }
                if (this.get("tool") === "hand") {
                    pickUpNpc(gameState, position);
                }
            },
            reduceHealth: function(value) {
                this.set({ health: Math.max(this.get("health") - value, 0) });
            }
        });
        
        var player = new Player({
            width: elements.player.width(),
            height: elements.player.height(),
            x: board.get("width") / 2,
            y: board.get("height") / 2,
            radius: 34,
            velocity: {x: 0, y: 0},
            directions: {x: 0, y: 0},
            angle: 0,
            tool: "gun",
            health: 10
        });
        
        var createNpcModel = function(options) {
            return Backbone.Model.extend({
                initialize: function() {
                    this.set({
                        status: "alive",
                        velocity: {x: 0, y: 0}
                    });
                },
                kill: options.kill,
                
                doTurn: options.doTurn,
                
                doRandomWalk: function() {
                    if (this.get("status") === "alive") {
                        if (this.get("turnsUntilChangeDirection") === 0) {
                            this.setVelocity();
                            this.set({ turnsUntilChangeDirection : 60 });
                        } else {
                            this.set({ turnsUntilChangeDirection : this.get("turnsUntilChangeDirection") - 1 });
                        }
                    
                        this.moveBy(this.get("velocity"));
                    }
                },
                setVelocity: function(direction) {
                    var speed = this.get("speed");
                    if(!direction) {
                        direction = Math.random() * 2 * Math.PI;
                    }
                    this.set({
                        velocity: {
                            x: speed * Math.cos(direction),
                            y: speed * Math.sin(direction)
                        }
                    });
                },
                pickUp: options.pickUp,
                moveBy: moveBy
            });
        };
        
        var Zombie = createNpcModel({
            kill: function(gameState) {
                this.set({status: "dead"});
                gameState.statistics.set({ zombiesKilled: gameState.statistics.get("zombiesKilled") + 1 });
                gameState.statistics.increaseScoreZombiesKilled();
                gameState.statistics.increaseCombatMultiplier();
            },
            pickUp: function(gameState) {
                // Zombie eats kitties in basket.
                gameState.statistics.decreaseScoreKittiesDevoured(gameState.statistics.get("kittiesSaved"));
                gameState.statistics.set({
                    kittiesDevoured: gameState.statistics.get("kittiesDevoured") + gameState.statistics.get("kittiesSaved"),
                    kittiesSaved: 0,
                    scoreKittiesSaved: 0
                });
            },
            doTurn: function() {
                if (this.get("status") === "alive") {
                    var awarenessRadius = this.get("awarenessRadius");                  
                    var displacement = calculateDisplacement(this, player);
                    var distanceBetweenThisAndPlayer = magnitudeOfDisplacement(displacement);
                    
                    if (distanceBetweenThisAndPlayer <= awarenessRadius) {
                        var killRadius = this.get("killRadius");
                        if (distanceBetweenThisAndPlayer <= killRadius) {
                            this.set({
                                velocity : {
                                    x : 0,
                                    y : 0
                                }
                            });

                            var numberOfTurnsBetweenHurt = 30;
                            var turnsUntilCanHurt = this.get("turnsUntilCanHurt");

                            if (turnsUntilCanHurt === 0) {
                                player.reduceHealth(1);
                                this.set({ turnsUntilCanHurt : numberOfTurnsBetweenHurt });
                            } else {
                                this.set({ turnsUntilCanHurt : turnsUntilCanHurt - 1 });
                            }
                        } else {
                            var direction = Math.atan2(displacement.y, displacement.x);
                            this.setVelocity(direction);
                        }
                        this.moveBy(this.get("velocity"));
                        
                    } else {
                        this.doRandomWalk();
                    }
                }
            }
        });
        
        var numberOfZombies = 20;
        var zombieWidth = 120;
        var createZombie = function() {
            return new Zombie({
                width: zombieWidth,
                height: zombieWidth,
                x: zombieWidth / 2 + ((board.get("width") - zombieWidth) * Math.random()),
                y: zombieWidth / 2 + ((board.get("height") - zombieWidth) * Math.random()),
                radius: zombieWidth / 2,
                turnsUntilChangeDirection : 0,
                speed : 4,
                awarenessRadius : 250,
                killRadius : 100,
                turnsUntilCanHurt : 30
            });
        };
        var zombies = _.map(_.range(numberOfZombies), createZombie);
                
        var Kitty = createNpcModel({
            kill: function(gameState) {
                this.set({status: "dead"});
                gameState.statistics.set({ kittiesKilled: gameState.statistics.get("kittiesKilled") + 1 });
                gameState.statistics.decreaseScoreKittiesKilled();
                gameState.statistics.increaseCombatMultiplier;
            },
            pickUp: function(gameState) {
                this.set({status: "picked-up"});
                gameState.statistics.set({ kittiesSaved: gameState.statistics.get("kittiesSaved") + 1});
                gameState.statistics.increaseScoreKittiesSaved();
            },
            doTurn: function() {
                this.doRandomWalk();
            }
        });
        var kittyWidth = 96;
        var createKitty = function() {
            return new Kitty({
                width: kittyWidth,
                height: kittyWidth,
                x: kittyWidth / 2 + ((board.get("width") - kittyWidth) * Math.random()),
                y: kittyWidth / 2 + ((board.get("height") - kittyWidth) * Math.random()),
                radius: kittyWidth / 2,
                turnsUntilChangeDirection : 0,
                speed : 5
            });
        };
        var kitties = _.map(_.range(numberOfKitties), createKitty);
        
        var Statistics = Backbone.Model.extend({
            initialize: function() {
                this.set({turn: 0});
            },
            
            doTurn: function() {
                this.set({turn: this.get("turn") + 1});
            },
            
            calculateScore: function() {
                var score = Math.round(this.get("scoreKittiesSaved") + this.get("scoreKittiesKilled") + this.get("scoreZombiesKilled") + this.get("scoreKittiesDevoured"));
                
                return score;
            },
            
            turnsSinceStart: function() {
                return this.get("turn");
            },
            
            increaseScoreKittiesSaved: function() {
                //Increase score based on time: increase = a (t-b)^2 + c, s.t. min score is 10, max score is 20, min occurs at t=100
                var a = 0.001;
                var b = 100;
                var c = 10;
                var t = this.turnsSinceStart() / 30;
                var increase;
                
                if(t > b) increase = c;
                else increase = a * (t - b) * (t - b) + c;
                
                this.set({scoreKittiesSaved: this.get("scoreKittiesSaved") + increase});
            },
            
            increaseScoreZombiesKilled: function() {
                var increase = 10;
                this.set({scoreZombiesKilled: this.get("scoreZombiesKilled") + increase + this.get("combatMultiplier")});
            },
            
            decreaseScoreKittiesKilled: function() {
                var decrease = 20;
                this.set({scoreKittiesKilled: this.get("scoreKittiesKilled") - decrease + this.get("combatMultiplier")});
            },
            
            decreaseScoreKittiesDevoured: function(numOfKitties) {
                var decrease = 5;
                this.set({scoreKittiesDevoured: this.get("scoreKittiesDevoured") - decrease * numOfKitties});
            },
            
            increaseCombatMultiplier: function() {
                var increase = 1;
                this.set({combatMultiplier: this.get("combatMultiplier") + increase});
            },
            
            decreaseCombatMultiplier: function() {
                var decreaseFactor = 2;
                this.set({combatMultiplier: Math.floor(this.get("combatMultiplier") / decreaseFactor)});
            }
        });
        
        var statistics = new Statistics({
            kittiesSaved: 0,
            kittiesKilled: 0,
            zombiesKilled: 0,
            kittiesDevoured: 0,
            scoreKittiesSaved: 0,
            scoreKittiesKilled: 0,
            scoreZombiesKilled: 0,
            scoreKittiesDevoured: 0,
            combatMultiplier: 0
        });
        
        var TorchLight = Backbone.Model.extend({});
        
        var torchLight = new TorchLight({
            width: elements.torchLight.width(),
            height: elements.torchLight.height(),
            x: 250,
            y: 250,
            radius: 175
        });
        
        var Gun = Backbone.Model.extend({
            doTurn: function(gameState) {
                var firedAt = gun.get("firedAt");
                if (firedAt) {
                    var alreadyHit = false;
                    var shootIfClose = function(model) {
                        if (alreadyHit || model.get("status") !== "alive") {
                            return;
                        }
                        var x = firedAt.x - model.get("x");
                        var y = firedAt.y - model.get("y");
                        var distance = Math.sqrt(x * x + y * y);
                        if (distance < model.get("radius")) {
                            model.kill(gameState);
                            alreadyHit = true;
                        }
                    };
                    _.forEach(gameState.kitties, shootIfClose);
                    _.forEach(gameState.zombies, shootIfClose);
                    
                    if(!alreadyHit) {
                        gameState.statistics.decreaseCombatMultiplier();
                    }
                }
            },
            fireAt: function(player, position) {
                var x = player.get("x") - position.x;
                var y = player.get("y") - position.y;
                var distance = Math.sqrt(x * x + y * y);
                
                var fudgeDistance = distance * 0.1;
                
                this.set({
                    firedAt: {
                        x: position.x + fudgeDistance * (Math.random() - 0.5),
                        y: position.y + fudgeDistance * (Math.random() - 0.5)
                    }
                });
            }
        });
        var gun = new Gun();
        
        return {
            player: player,
            torchLight: torchLight,
            board: board,
            kitties: kitties,
            zombies: zombies,
            gun: gun,
            statistics: statistics,
            createZombie: createZombie,
            createKitty: createKitty
        };
    };
    
    var initialiseInputs = function(gameState, elements) {
        var gamePositionFromEvent = function(event) {
            var gameOffset = elements.board.offset();
            return {x: event.pageX - gameOffset.left, y: event.pageY - gameOffset.top};
        };
        $(document).mousemove(function(e) {
            gameState.torchLight.set(gamePositionFromEvent(e));
        });
        
        $(document).mousedown(function(e) {
            var clickPosition = gamePositionFromEvent(e);
            gameState.player.doActionAt(gameState, clickPosition);
            return false;
        });
        
        var handleKeyAction = function(handler, type) {    //keydown type = 1, keyup type = -1
            return function(e) {
                switch (e.keyCode) {
                    case 87: // W
                    case 38: // Up
                        handler({y: -1});
                        break;
                    case 83: // S
                    case 40: // Down
                        handler({y: 1});
                        break;
                    case 65: // A
                    case 37: // Left
                        handler({x: -1});
                        break;
                    case 68: // D
                    case 39: // Right
                        handler({x: 1});
                        break;
                        
                    case 32: // Spacebar
                        if (type == 1) {
                            gameState.player.toggleTool();
                        }
                        break;
                        
                    default:
                        break;
                }
                return false;
            };
        };
        
        $(document).keydown(handleKeyAction(_.bind(gameState.player.addDirection, gameState.player), 1));
        $(document).keyup(handleKeyAction(_.bind(gameState.player.removeDirection, gameState.player), -1));
        
        return {
            remove: function() {
                _.forEach(["mousemove", "mousedown", "keydown", "keyup"], function(event) {
                    $(document).unbind(event);
                });
            }
        };
    };
    
    var findTopLeft = function(model) {
        var width = model.get("width");
        var height = model.get("height");
        var left = model.get("x") - 0.5 * width;
        var top = model.get("y") - 0.5 * height;
        return {
            left: left,
            top: top
        };
    };
    
    var centreElement = function(element, model) {
        var topLeft = findTopLeft(model);
        element.css("left", topLeft.left);
        element.css("top", topLeft.top);
        return topLeft;
    };
    
    var FloorView = Backbone.Model.extend({
               
        render: function(gameState, elements) {
            var wallWidth = 10;
            var margin = Math.min(elements.gamePanel.height(), elements.gamePanel.width()) / 3;
            // Scrolling up
            if (gameState.player.get("y") - this.get("y") < margin) {
                this.set({y: Math.max(0, gameState.player.get("y") - margin)});
            }
            // Scrolling down
            if (this.get("y") + elements.gamePanel.height() - gameState.player.get("y")  < margin) {
                var y = gameState.player.get("y") - elements.gamePanel.height() + margin;
                this.set({y: Math.min(y, gameState.board.get("height") - elements.gamePanel.height() + 2 * wallWidth)});
            }
            // Scrolling left
            if (gameState.player.get("x") - this.get("x") < margin) {
                this.set({x: Math.max(0, gameState.player.get("x") - margin)});
            }
            // Scrolling right
            if (this.get("x") + elements.gamePanel.width() - gameState.player.get("x")  < margin) {
                var x = gameState.player.get("x") - elements.gamePanel.width() + margin;
                this.set({x: Math.min(x, gameState.board.get("width") - elements.gamePanel.width() + 2 * wallWidth)});
            }
            
            elements.floor.css({
                width: gameState.board.get("width"),
                height: gameState.board.get("height")
            });
            elements.board.css({
                top: -this.get("y") + wallWidth,
                left: -this.get("x") + wallWidth
            });
        },
        
        createScenery: function(gameState, elements) {
            var createSceneryElement = function(sceneryType) {
                    var element = $('<div class="scenery ' + sceneryType + '"></div>');
                    element.css({
                        top: Math.random() * (gameState.board.get("height") - element.height()),
                        left: Math.random() * (gameState.board.get("width") - element.width())
                    });
                    return element;
                };
            // Add 40 scenery elements    
            for (i = 0; i < 40; i++) {
                if (Math.random() < 0.5) {
                    elements.board.append(createSceneryElement("bone"));
                } else {
                    elements.board.append(createSceneryElement("kittyclawdeath"));
                }
            }
        }
    });
    
    function pickUpNpc(gameState, position) {
        var alreadyPickedUp = false;
        var pickUpIfClose = function(model) {
            if (alreadyPickedUp) {
                return;
            }
            var x1 = position.x - model.get("x");
            var y1 = position.y - model.get("y");
            var distanceBetweenClickAndNpc = Math.sqrt(x1 * x1 + y1 * y1);
            
            var x2 = gameState.player.get("x") - model.get("x");
            var y2 = gameState.player.get("y") - model.get("y");
            var distanceBetweenNpcAndPlayer = Math.sqrt(x2 * x2 + y2 * y2);
            
            var clickedNearNpc = distanceBetweenClickAndNpc < model.get("radius") + 50;
            if (clickedNearNpc && distanceBetweenNpcAndPlayer < 200 && model.get("status") === "alive") {
                model.pickUp(gameState);
                alreadyPickedUp = true;
            }
        };
        _.forEach(gameState.zombies, pickUpIfClose);
        _.forEach(gameState.kitties, pickUpIfClose);
    }
    
    var PlayerView = Backbone.Model.extend({
        initialize: function() {
            this.set({
                direction: "right",
                animation: buildAnimation(this, {stopIfStill: true})
            });
        },
        doTurn: function(gameState) {
            var velocity = gameState.player.get("velocity");
            if (Math.abs(velocity.x) < Math.abs(velocity.y)) {
                if (velocity.y < 0) {
                    this.set({direction: "up"});
                } else {
                    this.set({direction: "down"});
                }
            } else if (velocity.x > 0) {
                this.set({direction: "right"});
            } else if (velocity.x < 0) {
                this.set({direction: "left"});
            }
            this.get("animation").doTurn();
        },
        render: function(gameState, elements) {
            if (gameState.player.get("health") <= 0) {
                elements.player.removeClass("animation-0");
                elements.player.removeClass("animation-1");
                elements.player.removeClass("left");
                elements.player.removeClass("right");
                elements.player.removeClass("up");
                elements.player.removeClass("down");
                elements.player.addClass("dead");
            } else {
                elements.player.removeClass("dead");
            }
            centreElement(elements.player, gameState.player);
            
            this.get("animation").render(gameState);
        }
    });
    
    var renderStatusBar = function(gameState, elements) {
        elements.statusBar.css("left", 0.5 * ($(window).width() - elements.statusBar.width()));
        elements.status.zombiesKilled.html(gameState.statistics.get("zombiesKilled") || 0);
        elements.status.kittiesKilled.html(gameState.statistics.get("kittiesKilled") || 0);
        elements.status.kittiesSaved.html(gameState.statistics.get("kittiesSaved") || 0);
        elements.status.health.attr("id", "statusHealth" + gameState.player.get("health"));
        elements.status.tool.attr("class", "status-tool-" + gameState.player.get("tool"));
    };
    
    var renderTorchLight = function(gameState, elements) {
        var gameOffset = elements.board.offset();
        var centre = centreElement(elements.torchLight, gameState.torchLight);
        $('.leftPanel').css("width", Math.max(0, centre.left));
        $('.topPanel').css("height", Math.max(0, centre.top));
        $('.rightPanel').css("width", Math.max(0, elements.board.width() - (centre.left + elements.torchLight.width())));
        $('.bottomPanel').css("height", Math.max(0, elements.board.height() - (centre.top + elements.torchLight.height())));
    };
    
    var renderTorchLightCover = function(gameState, elements) {
        var displacementBetweenPlayerAndTorchLight = calculateDisplacement(gameState.player, gameState.torchLight);
        var distanceBetweenPlayerAndTorchLight = magnitudeOfDisplacement(displacementBetweenPlayerAndTorchLight);
        var coverOpacity = Math.min(1, Math.max(0, 0.0013 * distanceBetweenPlayerAndTorchLight));
        elements.torchLightCover.css("opacity", coverOpacity);
    };
    
    var flashElement = function(element, callback) {
        var times = 3;
        var on = true;
        var toggleSpeed = 300;
        function toggle() {
            on = !on;                           
            element.toggle();                      
            if (on === true) {
                times = times - 1;
            }
            if (times === 0) {
                clearInterval(toggler); 
                if (callback) {
                    callback();
                }
            }
        }
        var toggler = setInterval(toggle, toggleSpeed);
    };
    
    var bulletViewLife = 10;
    var GunView = Backbone.Model.extend({
        initialize: function() {
            this.set({shots: []});
        },
        addShot: function(firedAt, gameState, elements) {
            var path = elements.bulletCanvas.path("M" + gameState.player.get("x") + " " + gameState.player.get("y") + "L" + firedAt.x + " " + firedAt.y);
            this.get("shots").push({
                path: path,
                turnsLeft: bulletViewLife
            });
        },
        doTurn: function(gameState, elements) {
            var firedAt = gameState.gun.get("firedAt");
            if (firedAt) {
                this.addShot(firedAt, gameState, elements);
            }
            var gunView = this;
            var shots = this.get("shots");
            _.forEach(shots, function(shot) {
                shot.turnsLeft -= 1;
                shot.path.attr({stroke: "rgba(200, 200, 200, " + (0.5 * shot.turnsLeft / bulletViewLife) + ")"});
                if (shot.turnsLeft === 0) {
                    gunView.change();
                }
            });
        },
        render: function(gameState, elements) {
            var shots = this.get("shots");
            var i;
            for (i = shots.length; i --> 0; ) {
                if (shots[i].turnsLeft === 0) {
                    shots[i].path.remove();
                    shots.splice(i, 1);
                }
            }
        }
    });
    
    var MessageView = Backbone.Model.extend({
        doTurn: function() {
            if (this.get("message")) {
                this.set({age: this.get("age") - 1});
                if (this.get("age") === 0) {
                    this.set({message: undefined});
                }
            }
        },
        render: function() {
            var message = this.get("message");
            var element = this.get("element");
            if (message) {
                element.text(message);
            } else {
                element.empty();
            }
        },
        setMessage: function(text)  {
            this.set({
                message: text,
                age: 30
            });
        }
    });
    
    var buildAnimation = function(view, options) {
        var turnsUntilChangeImage = 0;
        var turnsBetweenAnimations = 2;
        var imageNumber = 1;
        
        return {
            doTurn: function() {
                if (turnsUntilChangeImage === 0) {
                    imageNumber = (imageNumber + 1) % 2;
                    turnsUntilChangeImage = turnsBetweenAnimations;
                } else {
                    turnsUntilChangeImage = turnsUntilChangeImage - 1;
                }
            },
            render: function() {
                var direction = view.get("direction");
                var element = view.get("element");
                var velocity = view.get("model").get("velocity");
                if (options.stopIfStill && velocity.x === 0 && velocity.y === 0) {
                    element.removeClass("animation-0");
                    element.removeClass("animation-1");
                } else if (turnsUntilChangeImage === turnsBetweenAnimations) {
                    element.removeClass("left");
                    element.removeClass("right");
                    element.removeClass("up");
                    element.removeClass("down");
                    
                    element.removeClass("animation-" + ((imageNumber + 1) % 2));
                    element.addClass("animation-" + imageNumber);
                    element.addClass(direction);
                }
            }
        };
    };
    
    var NpcView = Backbone.Model.extend({
        initialize: function() {
            this.set({
                aliveAnimation: buildAnimation(this, {stopIfStill: false})
            });
        },
        render: function(gameState, elements) {
            var element = this.get("element");
            centreElement(element, this.get("model"));
            var status = this.get("model").get("status");
            if (status === "dead") {
                if (!element.hasClass("dead")) {
                    element.removeClass("animation-0");
                    element.removeClass("animation-1");
                    element.addClass("dead");
                }
            } else if (status === "picked-up") {
                var offset = element.offset();
                var gameOffset = elements.board.offset();
                var statusBarOffset = elements.statusBar.offset();
                
                var basketCentre = {
                    x: statusBarOffset.left + 620,
                    y: statusBarOffset.top + 85
                };
                element.css({
                    position: "fixed",
                    top: offset.top,
                    left: offset.left,
                    "z-index": 10000
                });
                element.animate({
                    top: basketCentre.y - element.height() / 2,
                    left: basketCentre.x - element.width() / 2
                }, function() {
                    element.remove();
                });
            } else {
                this.get("aliveAnimation").render();
            }
        },
    
        doTurn: function() {
            var velocity = this.get("model").get("velocity");
            if (velocity.x > 0) {
                this.set({direction: "right"});
            } else if (velocity.x < 0) {
                this.set({direction: "left"});
            };
            this.get("aliveAnimation").doTurn();
        }
    });
    
    var DamageIndicatorView = (function() {
        var maxAge = 30;
        return Backbone.Model.extend({
            initialize: function() {
                this.set({age: 0});
            },
            doTurn: function() {
                this.set({age: this.get("age") - 1});
            },
            hit: function() {
                this.set({age: maxAge});
            },
            render: function() {
                this.get("element").css({
                    opacity: Math.max(0, this.get("age") / maxAge)
                });
            }
        });
    })();
    
    var CursorView = Backbone.Model.extend({
        doTurn: function() {
            
        },
        render: function(gameState, elements) {
            var currentCursor = this.get("cursor");
            var tool = gameState.player.get("tool");
            if (tool !== currentCursor) {
                elements.cursor.removeClass("cursor-selected-" + currentCursor);
                elements.cursor.addClass("cursor-selected-" + tool);
                this.set({cursor: tool});
            }
            elements.cursor.css({
                left: gameState.torchLight.get("x") - elements.cursor.width() / 2,
                top: gameState.torchLight.get("y") - elements.cursor.height() / 2
            });
        }
    });
    
    var initialiseRendering = function(gameState, elements) {
        var renderQueue = {};
        
        var addToRenderQueue = function(value) {
            return function() {
                renderQueue[value] = true;
            };
        };
        
        var gunView = new GunView();
        
        var floorView = new FloorView({
            x: (gameState.board.get("width") - elements.gamePanel.width()) / 2,
            y: (gameState.board.get("height") - elements.gamePanel.height()) / 2
        });
        
        floorView.createScenery(gameState, elements);
    
        var playerView = new PlayerView({element: elements.player, model: gameState.player});
    
        var messageView = new MessageView({element: elements.message});
        
        var damageIndicatorView = new DamageIndicatorView({element: elements.damageIndicator});
        
        var cursorView = new CursorView();
        
        // Torchlight
        gameState.torchLight.bind("change", addToRenderQueue("torchLight"));
        
        // Player
        gameState.player.bind("change", addToRenderQueue("player"));
        // Board
        gameState.player.bind("change", addToRenderQueue("board"));
        // Gun
        gameState.gun.bind("change", addToRenderQueue("gun"));
        gunView.bind("change", addToRenderQueue("gun"));
        // Torch Light Cover
        gameState.torchLight.bind("change", addToRenderQueue("torchLightCover"));
        gameState.player.bind("change", addToRenderQueue("torchLightCover"));
        // Statistics
        gameState.statistics.bind("change", addToRenderQueue("statusBar"));
        gameState.player.bind("change", addToRenderQueue("statusBar"));
        // Message
        messageView.bind("change", addToRenderQueue("message"));
        // Damage indicator
        damageIndicatorView.bind("change", addToRenderQueue("damageIndicator"));
        gameState.player.bind("change:health", _.bind(damageIndicatorView.hit, damageIndicatorView));
        // Cursor
        gameState.player.bind("change:tool", addToRenderQueue("cursor"));
        gameState.torchLight.bind("change", addToRenderQueue("cursor"));
        
        elements.bulletCanvas = Raphael(elements.game.find(".bullets").get(0), elements.board.width(), elements.board.height());
       
        var renderables = {
            player: _.bind(playerView.render, playerView),
            torchLight: renderTorchLight,
            board: _.bind(floorView.render, floorView),
            gun: _.bind(gunView.render, gunView),
            torchLightCover: renderTorchLightCover,
            statusBar: renderStatusBar,
            message: _.bind(messageView.render, messageView),
            damageIndicator: _.bind(damageIndicatorView.render, damageIndicatorView),
            cursor: _.bind(cursorView.render, cursorView)
        };
        
        var views = [floorView, gunView, playerView, messageView, damageIndicatorView, cursorView];
        
        var createNpcView = function(typeName, View) {
            return function(model) {
                var name = typeName + views.length;
                var element = $('<div class="' + typeName + '"></div>');
                elements.board.append(element);
                var view = new View({
                    model: model,
                    element: element
                });
                renderables[name] = _.bind(view.render, view);
                model.bind("change", addToRenderQueue(name));
                views.push(view);
            };
        };
        
        var createZombieView = createNpcView("zombie", NpcView);
        var createKittyView = createNpcView("kitty", NpcView);
        
        _.forEach(gameState.kitties, createKittyView);
        _.forEach(gameState.zombies, createZombieView);
        
        _.forEach(gameState.kitties, function(kitty) {
            kitty.bind("change:status", function() {
                if (kitty.get("status") === "dead") {
                    var messages = ["YOU MONSTER!", "MURDERER!", "YOU DISGUST ME", "SAVE THEM, DON'T SHOOT THEM!", "OH, THE HORROR!", "THIS IS SICKENING", "YOU PUMPED HIM FULL OF LEAD", "BLOOD SPATTER!", "POOR KITTY...", "WOO!"];
                    var i = Math.floor(Math.random() * messages.length);
                    messageView.setMessage(messages[i]);
                }
            });
        });
        
        gameState.statistics.bind("change:kittiesSaved", function() {
            var kittiesSaved = gameState.statistics.get("kittiesSaved");
            if (kittiesSaved === 0) {
                elements.status.kittiesSaved.css("color","red");
                messageView.setMessage("OM NOM NOM");
                flashElement(elements.status.kittyFeast, function() {
                    elements.status.kittiesSaved.css("color","green");
                });                
            }
        });

        var name;
        for (name in renderables) {
            renderables[name](gameState, elements);
        }
        
        return {
            render: function() {
                var name;
                for (name in renderQueue) {
                    renderables[name](gameState, elements);
                }
                gunView.render(gameState, elements);
                renderQueue = {};
            },
            views: views,
            createZombieView: createZombieView,
            createKittyView: createKittyView
        };
    };
    
    var calculateDisplacement = function(first, second) {
        var x = second.get("x") - first.get("x");
        var y = second.get("y") - first.get("y");
        return {x: x, y: y};
    };
    
    var magnitudeOfDisplacement = function(displacement) {
        return Math.sqrt(displacement.x * displacement.x + displacement.y * displacement.y);
    };
    
    var startGame = function() {
        var elements = copyAndGrabGameElements($(".gameComponents"));
        elements.game.show();
        setPositionsOfPanels(elements);
        elements.gameOverPanel.hide();
    
        $(window).resize(function() {
            setPositionsOfPanels(elements);
            renderStatusBar();
        });
        
        elements.cursor.attr({"class": "cursor"});
        var gameState = initialiseGameState(elements);
        elements.board.height(gameState.board.get("height"));
        elements.board.width(gameState.board.get("width"));
        var renderer = initialiseRendering(gameState, elements);
        var gameID;
        var inputs;
      
        var turnNumber = 0;
        var spawnRate = 0.015;
        var doTurn = function() {
            if (gameState.player.get("health") === 0) {
                clearInterval(gameID);
                inputs.remove();
                endGame(gameState.statistics, elements);
            } else {
                var aboutThirtySeconds = 30 * 30;
                if (turnNumber > 0 && turnNumber % aboutThirtySeconds === 0) {
                    spawnRate *= 1.5;
                }
                if (Math.random() <= spawnRate) {
                    var newZombie = gameState.createZombie();                
                    gameState.zombies.push(newZombie);
                    renderer.createZombieView(newZombie);
                    var newKitty = gameState.createKitty();                
                    gameState.kitties.push(newKitty);
                    renderer.createKittyView(newKitty);
                }
                var key;
                for (key in gameState) {
                    if ("length" in gameState[key]) {
                        _.forEach(gameState[key], function(obj) {
                            if (obj.doTurn) {
                                obj.doTurn();
                            }
                        });
                    } else {
                        if (gameState[key].doTurn) {
                            gameState[key].doTurn(gameState);
                        }
                    }
                }
                
                for (key in renderer.views) {
                    if (renderer.views[key].doTurn) {
                        renderer.views[key].doTurn(gameState, elements);
                    }
                }
                
                renderer.render();
                
                gameState.gun.set({firedAt: false});
            }
            turnNumber += 1;
        };
        
        $(document).one("click", function() {
            hideCursor();
            elements.instructionsPanel.hide();
            gameID = setInterval(doTurn, 30);
            inputs = initialiseInputs(gameState, elements);
            return false;
        });
    };
    
    var endGame = function(statistics, elements) {
        $(window).unbind("resize");
        var score = statistics.calculateScore();
        var ZK = statistics.get("zombiesKilled");
        var KK = statistics.get("kittiesKilled");
        var KS = statistics.get("kittiesSaved");
        var KD = statistics.get("kittiesDevoured");
        
        $(".evil-number#zombiesKilled").html(ZK);
        $(".evil-number#kittiesKilled").html(KK);
        $(".evil-number#kittiesSaved").html(KS);
        $(".evil-number#kittiesDevoured").html(KD);
        $(".evil-number#finalScore").html(score);
        
        //DETERMINE RANK HERE//
        
        var rank = [];
        
        if (ZK < 5) ;
        else if (ZK <= 10) rank.push("ZOMBIE CUDDLER");
        else if (ZK < 20) rank.push("ZOMBIE ZAPPER");
        else if (ZK <= 30) rank.push("ZOMBIE HIT-MAN");
        else if (ZK < 60) rank.push("ZOMBIE ERADICATOR");
        else rank.push("COLIN THE ZOMBIE SLAYER");    
        
        if (KS < 5) ;
        else if (KS <= 10) rank.push("KITTY CUDDLER");
        else if (KS < 30) rank.push("KITTY LOVER");
        else if (KS < 50) rank.push("KITTY COMPANION");
        else rank.push("KITTY SAVIOUR");
        
        if (KD < 25) ;
        else if (KD < 40) rank.push("THE BONECRUNCHER");
        else if (KD < 60) rank.push("THE GOBBLER");
        else rank.push("THE KITTYCHEWER");
        
        if (KK < 10) ;
        else if (KK < 25) rank.push("KITTY KILLER");
        else if (KK < 50) rank.push("KITTY CUT-THROAT");
        else rank.push("KITTEN SLAUGHTERER");
        
        var DK = KK + KD; //(dead kitties)
        if (DK < 20) ;
        else if (DK < 40) rank.push("THE ASSASSIN");
        else if (DK < 60) rank.push("KITTY HIT-MAN");
        else rank.push("THE BUTCHER BOY");        
        
        if (ZK < 5 && DK > 50) rank.push("AGENT OF THE UNDEAD");
        if (ZK > 30 && DK > 30) rank.push("THE TERMINATOR");
        if (ZK > 60 && DK > 60) rank.push("THE DESTROYER");
        if (ZK > 80 && DK > 80) rank.push("MASTER OF MUTILATION");
        
        if (rank.length === 0) finalRank = "DOWNRIGHT PATHETIC";
        else {        
            var i = Math.floor(Math.random() * rank.length);
            var finalRank = rank[i];
        }
        
        //END RANK STUFF HERE//
        
        $(".evil-title#overallRank").html(finalRank);

        setTimeout(function() {
            elements.gameOverPanel.show();        
            elements.game.animate({
                opacity: 0
            }, 1500, function() {
                elements.game.remove();
            });
            showCursor();
        }, 500);
    }
    
    function setPositionsOfPanels(elements) {
        elements.gamePanel.css("height", $(window).height() - elements.status.panel.height());
        elements.status.panel.css("top", $(window).height() - elements.status.panel.height());
        elements.instructionsPanel.css({
            left: 0.5 * (elements.gamePanel.width() - elements.instructionsPanel.width()),
            top: 0.5 * (elements.gamePanel.height() - elements.instructionsPanel.height())
        });
    }
    
    $(".start-game").click(function() {
        var blackoutElement = $(".blackout");
        blackoutElement.show();        
        
        blackoutElement.animate({
            opacity: 1
        }, 1500, function() {
            setTimeout(function() {
                $(".initial-content").hide();
                blackoutElement.css({opacity: 0});
                blackoutElement.hide();
                
                startGame();
            }, 500);
        });
    });

});
