import * as IAM from "../hls-iam"
import * as redis from "redis"
const mqtt = require("mqtt")

var child_process = require('child_process');

module.exports = function(app){
    var currentRuns = {}
    var client = mqtt.connect(process.env.HLS_MQTT_BROKER, {
        username: 'HLS:AccessToken',
        password: process.env.HLS_ACCESS_TOKEN
    })

    client.on("connect", () => {
        console.log('Successfully connected to MQTT client.')
    })

    client.on("error", (error) => {
        console.log('Error with MQTT client.', error)
    })

    app.get('/scripts/Run/Start', function(req, res) {
        if (client.connected == false) {
            res.status(500).send({"message": `Could not connect to MQTT client.`})
            return;
        }
        var runName = req.query.name;
        var run = getRun(runName);
        if (run.running) {
            res.status(400).send({"message": `${run.name} is already running.`})
            return;
        }
        var defaults = {
            HLS_ACCESS_TOKEN: process.env.HLS_ACCESS_TOKEN,
            HLS_MQTT_BROKER: process.env.HLS_MQTT_BROKER,
            NODE: process.env.NODE,
            PATH: process.env.PATH
        }
        var environment = {
        }
        Object.keys(run.channels).forEach((channel) => {
            environment[run.channels[channel]] = channel;
        })
        console.log('Start run: '+run.name);
        const which = require('which');
        const npm = which.sync('npm');
        var parts = run.name.split('/scripts/')[1].split('/')
        parts.pop()
        var scriptParts = run.name.split("/");
        scriptParts.pop()
        var script = getScript(scriptParts.join("/"));
        var scriptPath = `/tmp/hls/scripts/`+parts.join("/");
        console.log(`[${npm} install] in [${scriptPath}]`);

        var runScript = () => {
            runlog(client, run, "Start")
            console.log(`[${npm} start] in [${scriptPath}]`);
            var run_process = child_process.spawn('npm', ['start'], {
                cwd: scriptPath,
                env: Object.assign({}, defaults, script.defaultEnvironment, environment),
                shell: true,
            })

            run_process.stdout.on('data', function (data) {
                runlog(client, run, data.toString())
            });

            run_process.stderr.on('data', function (data) {
                runlog(client, run, data.toString())
            });

            currentRuns[run.name] = run_process;
            run.running = true;
            putRun(run.name, run);
            res.status(200).send({"message": `Started run ${run.name}.`})
        }
        
        var installScript = () => {
            child_process.exec(npm+' install', {
                cwd: scriptPath
            }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
                console.log(`stdout: ${stdout}`);
                console.log(`stderr: ${stderr}`);
                //runScript.call(this)
                setTimeout(() => {
                    runScript.call(this)
                })
            })
        }
        installScript()
    });

    app.get('/scripts/Run/Stop', function(req, res) {
        var runName = req.query.name;
        var run = getRun(runName);
        if (run.running == false) {
            res.status(400).send({"message": `${run.name} is not running.`})
            return;
        }
        runlog(client, run, "Stop")
        console.log('End run: '+run.name);
        if (run.name in currentRuns) {
            currentRuns[run.name].kill()
        }
        run.running = false;
        putRun(run.name, run);
        res.status(200).send({"message": `Stopped run ${run.name}.`})
    });
}

var scripts = {
    "/organizations/heatworks/scripts/model-1x/CycleFlowRandom": {
        "name":"/organizations/heatworks/scripts/model-1x/CycleFlowRandom",
        "description": "",
        "tags": {

        },
        "defaultEnvironment": {

        },
        "environment": "nodejs"
    },
    "/organizations/heatworks/scripts/model-1x/CycleFlowInterval": {
        "name":"/organizations/heatworks/scripts/model-1x/CycleFlowInterval",
        "description": "",
        "tags": {

        },
        "defaultEnvironment": {
            "interval": 1,
            "increase": 1
        },
        "environment": "nodejs"
    },
    "/organizations/heatworks/scripts/model-1x/CycleFlowMonitor": {
        "name":"/organizations/heatworks/scripts/model-1x/CycleFlowMonitor",
        "description": "",
        "tags": {

        },
        "defaultEnvironment": {
        },
        "environment": "nodejs"
    }
}

var runs = {
    "/organizations/heatworks/scripts/model-1x/CycleFlowRandom/test-station-a": {
        "name":  "/organizations/heatworks/scripts/model-1x/CycleFlowRandom/test-station-a",
        "description": "",
        "tags": {
        },
        "channels": {
            "/organizations/heatworks/devices/solenoid6/A/2Control":"FlowControl"
        },
        "running": false
    },
    "/organizations/heatworks/scripts/model-1x/CycleFlowInterval/test-station-a": {
        "name":  "/organizations/heatworks/scripts/model-1x/CycleFlowInterval/test-station-a",
        "description": "",
        "tags": {
        },
        "channels": {
            "/organizations/heatworks/devices/solenoid6/A/2Control":"FlowControl"
        },
        "running": false
    },
    "/organizations/heatworks/scripts/model-1x/CycleFlowMonitor/test-station-a": {
        "name":  "/organizations/heatworks/scripts/model-1x/CycleFlowMonitor/test-station-a",
        "description": "",
        "tags": {
        },
        "channels": {
            "/organizations/heatworks/devices/solenoid6/A/1Control":"WaterIn",
            "/organizations/heatworks/devices/solenoid6/A/6Control":"Power",
            "/organizations/heatworks/devices/analog8/A/3":"Flow",
            "/organizations/heatworks/devices/analog8/A/2":"Current"
        },
        "running": false
    }
    
}

function getRun(name) {
    return runs[name];
}
function putRun(name, run) {
    runs[name] = run;
    return run;
}

function runlog(client, run, log) {
    console.log(log);
    var parts = run.name.split("/scripts/")
    var topic = `${parts[0]}/devices/scripts/${parts[1]}`
    var lines = log.split("\n");
    lines.forEach((line) => {
        if (line.length > 0) {
            publishLine(client, topic, line)
        }
    })
}
function publishLine(client, topic, line) {
    var date = new Date();
    client.publish(topic, [ date.getTime() / 1000, `"${line}"` ].join(","));
}

function getScript(name) {
    return scripts[name];
}