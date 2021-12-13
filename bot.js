const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
  },
});

const bodyParser = require("body-parser");
const cors = require("cors");

const ethers = require("ethers");

const pino = require("pino");
const expressPino = require("express-pino-logger");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const expressLogger = expressPino({ logger });

const port = 3000;

app.use(cors());
app.use(expressLogger);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const ActiveFactoryMap = new Map();
let usersOnline = 0;

/* SOCKET.IO CONNECTION */
io.on("connection", (socket) => {
  usersOnline += 1;
  socket.emit("socketId", socket.id);
  socket.emit("usersOnline", usersOnline);

  console.log("connected", socket.id);

  socket.on("disconnect", (data) => {
    console.log("disconnected", socket.id);
    ActiveFactoryMap.get(socket.id)?.removeAllListeners();
    usersOnline -= 1;
    socket.emit("usersOnline", usersOnline);
  });
});

/* COSTANTS */
const CONSTANTS = {
  FACTORY_ADDRESS: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // PancakeSwap V2 factory address
  ROUTER_ADDRESS: "0x10ED43C718714eb63d5aA57B78B54704E256024E", //PancakeSwap V2 router
  BNB_ADDRESS: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // BNB CONTRACT ADDRESS
  BUSD_ADDRESS: "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD CONTRACT ADDRESS

  FACTORY_ABI: [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
    "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  ],
  ROUTER_ABI: [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) external  payable returns (uint[] memory amounts)",
    "function swapExactETHForTokens( uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  ],
  ERC20_ABI: [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      payable: false,
      type: "function",
    },
    {
      constant: false,
      inputs: [
        {
          name: "_spender",
          type: "address",
        },
        {
          name: "_value",
          type: "uint256",
        },
      ],
      name: "approve",
      outputs: [
        {
          name: "",
          type: "bool",
        },
      ],
      payable: false,
      stateMutability: "nonpayable",
      type: "function",
    },
  ],
};

/* ENDPOINTS */
app.post("/pair-created-listner", (req, res) => {
  const body = req.body;

  io.to(body.socketId).emit("logs", "BOT STARTED");

  const provider =
    body.rpc.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(body.rpc)
      : new ethers.providers.JsonRpcProvider(body.rpc);
  const wallet = new ethers.Wallet(body.privateKey);
  const account = wallet.connect(provider);

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  ActiveFactoryMap.set(body.socketId, factory);

  factory.on("PairCreated", async (token0, token1, pairAddress) => {
    [token0, token1, pairAddress, body.token] = [
      token0.toUpperCase(),
      token1.toUpperCase(),
      pairAddress.toUpperCase(),
      body.token.toUpperCase(),
    ];

    io.to(body.socketId).emit(
      "logs",
      `
~~~~~~~~~~~~~~~~~~
New pair detected
~~~~~~~~~~~~~~~~~~
token0: ${token0}
token1:  ${token1}
addressPair:  ${pairAddress}
`
    );

    if (token0 === body.token || token1 === body.token) {
      logger.info("");
      logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
      logger.info("FOUND!");
      logger.info("::::::::::::::::::::::::::::::::::::::::::::::::");
      logger.info("");

      io.to(body.socketId).emit("logs", `<strong>Pair FOUND!</strong>`);

      if (token0 === CONSTANTS.BNB_ADDRESS) {
        swapExactETHForTokens(
          body.socketId,
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token0,
          token1,
          wallet.address,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token1 === CONSTANTS.BNB_ADDRESS) {
        swapExactETHForTokens(
          body.socketId,
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token1,
          token0,
          wallet.address,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token0 === CONSTANTS.BUSD_ADDRESS) {
        swapExactTokensForTokens(
          body.socketId,
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token0,
          token1,
          wallet.address,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      } else if (token1 === CONSTANTS.BUSD_ADDRESS) {
        swapExactTokensForTokens(
          body.socketId,
          factory,
          router,
          body.amountToBuy,
          body.amountOutMin,
          token1,
          token0,
          wallet.address,
          body.gasLimit,
          body.gasPrice,
          body.decimals
        );
      }
    } else {
      io.to(body.socketId).emit(
        "logs",
        `<strong>Pair don't match! </strong>
~~~~~~~~~~~~~~~~~`
      );
    }
  });

  res.send({ res: "BOT STARTED" });
});

app.post("/fast-buy", (req, res) => {
  const body = req.body;

  io.to(body.socketId).emit("logs", "BOT STARTED");

  const provider =
    body.rpc.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(body.rpc)
      : new ethers.providers.JsonRpcProvider(body.rpc);
  const wallet = new ethers.Wallet(body.privateKey);
  const account = wallet.connect(provider);

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  io.to(body.socketId).emit(
    "logs",
    `
~~~~~~~~~~~~~~~~~~
FAST BUY START
~~~~~~~~~~~~~~~~~~
`
  );

  swapExactETHForTokens(
    body.socketId,
    factory,
    router,
    body.amountToBuy,
    body.amountOutMin,
    CONSTANTS.BNB_ADDRESS,
    body.token,
    wallet.address,
    body.gasLimit,
    body.gasPrice,
    body.decimals
  );

  res.send({ res: "BOT STARTED" });
});

app.post("/fast-sell", (req, res) => {
  const body = req.body;

  io.to(body.socketId).emit("logs", "BOT STARTED");

  const provider =
    body.rpc.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(body.rpc)
      : new ethers.providers.JsonRpcProvider(body.rpc);
  const wallet = new ethers.Wallet(body.privateKey);
  const account = wallet.connect(provider);

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  io.to(body.socketId).emit(
    "logs",
    `~~~~~~~~~~~~~~~~~~
    FAST SELL START
    ~~~~~~~~~~~~~~~~~~`
  );
  swapExactTokensForETH(
    body.socketId,
    factory,
    router,
    body.amountToBuy,
    body.amountOutMin,
    body.token,
    CONSTANTS.BNB_ADDRESS,
    wallet.address,
    body.gasLimit,
    body.gasPrice,
    body.decimals
  );

  res.send({ res: "BOT STARTED" });
});

app.post("/approve", (req, res) => {
  const body = req.body;

  io.to(body.socketId).emit("logs", "BOT STARTED");

  const provider =
    body.rpc.indexOf("wss") >= 0
      ? new ethers.providers.WebSocketProvider(body.rpc)
      : new ethers.providers.JsonRpcProvider(body.rpc);
  const wallet = new ethers.Wallet(body.privateKey);
  const account = wallet.connect(provider);

  const factory = new ethers.Contract(
    CONSTANTS.FACTORY_ADDRESS,
    CONSTANTS.FACTORY_ABI,
    account
  );

  const router = new ethers.Contract(
    CONSTANTS.ROUTER_ADDRESS,
    CONSTANTS.ROUTER_ABI,
    account
  );

  io.to(body.socketId).emit(
    "logs",
    `
~~~~~~~~~~~~~~~~~~
APPROVE TOKEN
~~~~~~~~~~~~~~~~~~
`
  );

  const tokenContract = new ethers.Contract(
    body.token,
    CONSTANTS.ERC20_ABI,
    account
  );

  approve(tokenContract, body.sockedId, body.amountToBuy, body.decimals, body.gasLimit, body.gasPrice);
  res.send({ res: "BOT STARTED" });
});

app.post("/remove-all-listners", (req, res) => {
  const body = req.body;
  io.to(body.socketId).emit("logs", `BOT TERMINATED`);
  ActiveFactoryMap.get(body.socketId)?.removeAllListeners();
  res.send({ res: "DONE" });
});

/*  FUNCTIONS */
async function swapExactETHForTokens(
  socketId,
  factory,
  router,
  amountToBuy,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  const amountIn = ethers.utils.parseUnits(amountToBuy, "ether");
  io.to(socketId).emit("logs", `SwapExactETHForTokens start ... `);

  const tx = await router.swapExactETHForTokens(
    `${amountOutMin * 10 ** decimals}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5, //5 minutes
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
      value: amountIn,
    }
  );
  tx.wait()
    .then((resp) => {
      logger.info(resp);
      io.to(socketId).emit(
        "logs",
        `<strong>Token purchased successfully! ;)</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    })
    .catch((err) => {
      logger.info(err);
      io.to(socketId).emit(
        "logs",
        `<strong>ERROR! Token purchase unsuccessful :(</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    });
}
async function swapExactTokensForTokens(
  socketId,
  factory,
  router,
  amountToBuy,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  io.to(socketId).emit("logs", `swapExactTokensForTokens start ... `);
  const amountIn = amountToBuy * 600 * 10 ** 18; // calcolare BUSD oppure no?
  const tx = await router.swapExactTokensForTokens(
    `${amountIn}`,
    `${amountOutMin * 10 ** decimals}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5,
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
    }
  );
  tx.wait()
    .then((resp) => {
      logger.info(resp);
      io.to(socketId).emit(
        "logs",
        `<strong>Token purchased successfully! ;)</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    })
    .catch((err) => {
      logger.info(err);
      io.to(socketId).emit(
        "logs",
        `<strong>ERROR! Token purchase unsuccessful :(</strong>
~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    });
}
async function swapExactTokensForETH(
  socketId,
  factory,
  router,
  amountToBuy,
  amountOutMin,
  tokenIn,
  tokenOut,
  recipient,
  gasLimit,
  gasPrice,
  decimals
) {
  io.to(socketId).emit("logs", `swapExactTokensForETH start ... `);
  const amountIn = amountToBuy * 10 ** decimals;
  const tx = await router.swapExactTokensForETH(
    `${amountIn}`,
    `${ethers.utils.parseUnits(`${amountOutMin}`, "ether")}`,
    [tokenIn, tokenOut],
    recipient,
    Date.now() + 1000 * 60 * 5,
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
    }
  );
  tx.wait()
    .then((resp) => {
      logger.info(resp);
      io.to(socketId).emit(
        "logs",
        `<strong>Token sold successfully! ;)</strong>
  ~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    })
    .catch((err) => {
      logger.info(err);
      io.to(socketId).emit(
        "logs",
        `<strong>ERROR! Token sold unsuccessful :(</strong>
  ~~~~~~~~~~~~~~~~~`
      );
      factory.removeAllListeners();
    });
}
async function approve(tokenContract, socketId, amountToBuy, decimals, gasLimit, gasPrice) {

  const tx = await tokenContract.approve(
    CONSTANTS.ROUTER_ADDRESS,
    `${amountToBuy * 10 ** decimals}`,
    {
      gasLimit: gasLimit,
      gasPrice: ethers.utils.parseUnits(`${gasPrice}`, "gwei"),
      nonce: null,
    }
  );

  tx.wait()
    .then((resp) => {
      io.to(socketId).emit(
        "logs",
        `TOKEN APPROVED WITH SUCCESS!
      ~~~~~~~~~~~~~~~~~~
  `
      );
    })
    .catch((resp) => {
      io.to(socketId).emit(
        "logs",
        `APPROVE ERROR!
      ~~~~~~~~~~~~~~~~~~
  `
      );
    });
}

/* START SERVER */
http.listen(process.env.PORT || port, () =>
  console.log(`SniperBot listening on port ${process.env.PORT || port}!`)
);
