angular.module('app.portfolio', ["chart.js"])

  //<h3> Portfolio Controller </h3>
.controller('PortfolioController', function($scope, $location, $mdDialog, Portfolio, Auth, Root, $rootScope, Scores, TransactionHist, User) {
  $scope.investments;
  $scope.clickedInvestment;
  $scope.currentUserInfo = "invalid";
  $scope.labels = [];
  $scope.transactions = []
  $scope.openTransactions = [];
  $scope.currentInvestmentsView = true;
  $scope.openTransactionsView = false;
  $scope.transactionHistoryView = false;
  $scope.query = {
    order: 'name',
    limit: 1,
    page: 1
  };

  //Auth check on portfolio view
  Auth.checkLoggedIn().then(function(boolean) {
    if (boolean === false) {
      $location.path('/')
    } else {
      $scope.getTransactionHist();
      $scope.addLabels(30)
    }
  })

  //getUserById grabs the logged in user's portfolio information
  $scope.getUserById = function(id) {
    User.getUser(id)
    .then(function(user) {
      $scope.loggedinUserInfo = user[0];
    })
  }

  //getInvestment grabs all the current investment of the logged in user
  //properties on an investment object
  // currentScore: 45
  // data: Array[1]
  // id: 3220
  // name: "Clemens Rohan"
  // numberShares: 64
  // series: "Clemens Rohan"
  // target_id: 85
  // user_id: 1
  $scope.getInvestments = function(id) {
    Portfolio.getInvestments(id)
    .then(function(investments) {
      $scope.investments = investments;
    })
  }

//<h3>Investment graph functions</h3>
//uses the investment objects to calculate the score history of the investment so that the graph can be representative
  $scope.getScores = function(target_id, obj){
    obj.data = [[]]
    obj.series = obj.name
    Scores.getScores(target_id)
    .then(function(scoresHist){
      for(var i = 0; i < scoresHist.length; i++){
        obj.data[0].push(scoresHist[i].currentScore)
      }
      var daysBeforeUserJoined = $scope.labels.length - obj.data[0].length
      for(var i = 0; i < daysBeforeUserJoined; i++){
        obj.data[0].unshift(0)
      }
      // obj.currentScore = obj.data[0][obj.data[0].length - 1]
      User.getUser(target_id)
        .then(function(user) {
          obj.currentScore = user[0].currentScore;
          $scope.addProfit(obj)
        })
    })
  }

//getTransactionHist gets all transactions for the logged in user
//sample properties on a transaction object
// id: 1729
// karma: 4576
// numberShares: 44
// target_id: 64
// target_name: "Rosie Bergnaum"
// type: "sell"
// user_id: 1
  $scope.getTransactionHist = function() {
    TransactionHist.getTransactions($rootScope.loggedinUserInfo.id)
    .then(function(results) {
      $scope.transactions = results.reverse();
      $scope.getInvestments($rootScope.loggedinUserInfo.id);
    })
  }
//getOpenUserTransactions gets all pending transactions for the logged in user
  $scope.getOpenUserTransactions = function(){
    var user_id = $rootScope.loggedinUserInfo.id
    //using a hash table to keep track of the openTransaction index of the user in question because of the asynch call below
    var hashedTransactions = {};
    TransactionHist.getOpenUserTransactions(user_id)
    .then(function(openTransactions){
      for(var i = 0; i < openTransactions.length; i++){
        var target_id = openTransactions[i].target_id
        if(hashedTransactions[target_id]){
          hashedTransactions[target_id].push(openTransactions[i])
        } else {
          hashedTransactions[target_id] = [openTransactions[i]]
        }
        User.getUser(openTransactions[i].target_id)
        .then(function (userInfo) {
          userInfo = userInfo[0]
          var openTransactionForTarget = hashedTransactions[userInfo.id]
          for(var subI = 0; subI < openTransactionForTarget.length; subI++){
            var openTransaction = openTransactionForTarget[subI]
            openTransaction.target_name = userInfo.name
            openTransaction.currentScore = userInfo.currentScore
          }
        })
      }
      $scope.openTransactions = openTransactions;
    })
  }

//generates labels for the graph. Initially to 30 days in the past however that can be modified in the future
  $scope.addLabels = function(daysInPast){
    for(; daysInPast >= 0; daysInPast--){
      if(daysInPast % 5 === 0){
        $scope.labels.push(daysInPast)
      } else {
        $scope.labels.push("")
      }
    }
  }

//clickSell opens the Sell Modal
  $scope.clickSell = function(investment) {
    $scope.clickedInvestment = investment.id;
    $mdDialog.show({
      templateUrl: '../app/views/sell.html',
      locals: {
        investment: investment
      },
      controller: SellModalController
    })
      .then(function(clickedItem) {
      })
  }
//clickCancel cancels an open transaction, removing it from the queue
  $scope.clickCancel = function(transactionId, index){
    TransactionHist.deleteOpenTransaction(transactionId).then(function(response){
      if(response.status === 204){
        $scope.openTransactions.splice(index,1)
      }
    })
  }

//buildHistString turns a transaction into a human friendly string
  $scope.buildHistString = function(transaction){
    var type = transaction.type === "buy"? ' bought ' : ' sold ';
    var deltaKarma = transaction.type === "buy"? ' sharing ' : ' earning ';
    transaction.string = "You" + type + transaction.numberShares + " shares of " + transaction.target_name + deltaKarma + Math.abs(transaction.karma) + " karma."
  }

//searches through the investment history to get the profit for each set of shares
//Could eventually be on the backend
/*
unless we always want to grab the entire transaction history for a user.
It could be added by making a controller that searched through transaction hist by user_id and target_id to
help refine the search then using that to add a profit to the object whenever a user makes a get request for
their current stocks.
*/
  $scope.addProfit = function(investment){
    var shares = investment.numberShares
    var profit = 0;

    for(var i = 0; i < $scope.transactions.length; i++){
      var transaction = $scope.transactions[i];

      if(investment.target_id === transaction.target_id) {

        if(shares - transaction.numberShares > 0){
          profit += (transaction.numberShares * investment.currentScore - transaction.karma)
          shares -= transaction.numberShares
          investment.profit = profit;
          // <= 0
        } else {
          var transactionScore = Math.abs(Math.round(transaction.karma / transaction.numberShares))
          profit += (shares * investment.currentScore - shares * transactionScore)
          shares = 0
          investment.profit = profit;
          break;
        }
      }
    }
  }
  //toggleViews switches to different views within the portfolio view
  $scope.toggleViews = function(viewToShow){
    if(viewToShow === "transactionHistory"){
      $scope.transactionHistoryView = true;
      $scope.currentInvestmentsView = false;
      $scope.openTransactionsView = false;
    } else if (viewToShow === "currentInvestments"){
      $scope.currentInvestmentsView = true;
      $scope.transactionHistoryView = false;
      $scope.openTransactionsView = false;
    } else {
      $scope.openTransactionsView = true;
      $scope.currentInvestmentsView = false;
      $scope.transactionHistoryView = false;
    }
  }

  $scope.toggleOpenTransactions = function(){
    $scope.getOpenUserTransactions()
    $scope.toggleViews('openTransactions')
  }

  //The Sell Modal Controller, which handles all possible sell actions
  function SellModalController($scope, $mdDialog, $location, investment, TransactionHist, Socket, Scores, User, $rootScope) {
    $scope.investment = investment;
    $scope.requestedShares;
    $scope.requestedSharesInfo;
    $scope.sharesToSell=0;
    $scope.scores;
    $scope.targetCurrentScore;
    $scope.numSharesInTransactionQueueByUser;
    $scope.revealOptions = false;
    $scope.errorMessage = false;

    $scope.getUsersOpenSellTransactionsForTarget = function () {
      $scope.numSharesInTransactionQueueByUser = 0;
      TransactionHist.getOpenUserSellTransactionsForTarget($scope.investment.user_id, $scope.investment.target_id)
        .then(function (response) {
          for (var i = 0; i < response.length; i++) {
            $scope.numSharesInTransactionQueueByUser += response[i].numberShares;
          }
        })
    }

    //Confirm checks to see if logged in user can sell x number of shares
    $scope.confirm = function() {
      var transaction = {
        user_id: $scope.investment.user_id,
        target_id: $scope.investment.target_id,
        type: "sell",
        numberShares: $scope.sharesToSell,
        // // what even is this karma?
        // karma: $scope.sharesToSell * $scope.investment.currentScore
      }

      if ($scope.sharesToSell > $scope.investment.numberShares - $scope.numSharesInTransactionQueueByUser) {
        $scope.errorMessage = true;
      } else {
        $scope.errorMessage = false;
        console.log($scope.requestedShares);
        if ($scope.sharesToSell > $scope.requestedShares) {
          $scope.revealOptions = true;
          console.log("There are not enough matching buy requests to match your request to sell.")
        } else {
          TransactionHist.makeTransaction(transaction)
            .then(function () {
              $mdDialog.hide();
              $location.path('/portfolio/'+$rootScope.loggedinUserInfo.id);
            })
          if ($scope.requestedSharesInfo && $scope.requestedSharesInfo.user_id !== $rootScope.loggedinUserInfo.id.toString()){
            $rootScope.loggedinUserInfo.karma = $rootScope.loggedinUserInfo.karma + ($scope.investment.currentScore * $scope.sharesToSell);
            $scope.investment.numberShares -= $scope.sharesToSell;
          }
          console.log("You successfully sold shares.");
        }
      }
    }

    //Exit exits out of the Sell modal
    $scope.exit = function () {
      $mdDialog.hide();
    }

    //Wait will add the sell transaction to the transaction queue
    $scope.wait = function () {
      var transaction = {
        user_id: $scope.investment.user_id,
        target_id: $scope.investment.target_id,
        type: "sell",
        numberShares: $scope.requestedShares,
        //reference logged in user's karma
      };
      if ($scope.sharesToSell > $scope.investment.numberShares - $scope.numSharesInTransactionQueueByUser) {
        $scope.errorMessage = true;
      } else {
        $scope.errorMessage = false;
        TransactionHist.makeTransaction(transaction).then(function() {
          transaction.numberShares = $scope.sharesToSell - $scope.requestedShares;
          TransactionHist.addTransactionToQueue(transaction);
        });
        Scores.updateSocialInvestment($scope.investment.target_id);
        if ($scope.requestedSharesInfo && $scope.requestedSharesInfo.user_id !== $rootScope.loggedinUserInfo.id.toString()) {
          $rootScope.loggedinUserInfo.karma += $scope.investment.currentScore * ($scope.requestedShares)
          $scope.investment.numberShares -= $scope.requestedShares;
        }
      }
      $mdDialog.hide();
      $location.path('/portfolio/' + $rootScope.loggedinUserInfo.id)
    }

    //sellDirect will sell shares directly to the Karma Exchange.
    $scope.sellDirect = function () {
      var transaction = {
        user_id: $scope.investment.user_id,
        target_id: $scope.investment.target_id,
        type: "sell",
        numberShares: $scope.requestedShares,
      }
      var newScore = $scope.investment.currentScore * 0.9;
      if ($scope.sharesToSell > $scope.investment.numberShares - $scope.numSharesInTransactionQueueByUser) {
        $scope.errorMessage = true;
      } else {
        $scope.errorMessage = false;
        if ($scope.requestedShares) {
          TransactionHist.makeTransaction(transaction).then(function() {
            transaction.numberShares = $scope.sharesToSell - $scope.requestedShares;
            TransactionHist.closeTransactionRequest(transaction, newScore);
          })
          // Scores.updateSocialInvestment($scope.investment.id);
        } else {
          transaction.numberShares = $scope.sharesToSell;
          TransactionHist.closeTransactionRequest(transaction, newScore);
        }
        // transaction.karma = $scope.investment.currentScore * $scope.requestedShares + newScore * ($scope.sharesToSell - $scope.requestedShares);
        Scores.updateSocialInvestment($scope.investment.target_id);
        if ($scope.requestedSharesInfo && $scope.requestedSharesInfo.user_id !== $rootScope.loggedinUserInfo.id.toString()) {
          $scope.investment.numberShares -=$scope.sharesToSell;
          $rootScope.loggedinUserInfo.karma += Math.round($scope.investment.currentScore * $scope.requestedShares + newScore * ($scope.sharesToSell - $scope.requestedShares));
        } else {
          $scope.investment.numberShares -= $scope.sharesToSell - $scope.requestedShares;
          $rootScope.loggedinUserInfo.karma += Math.round(newScore * ($scope.sharesToSell - $scope.requestedShares))
        }

        $mdDialog.hide();
        $location.path('/portfolio/' + $rootScope.loggedinUserInfo.id);
      }
    }

    $scope.checkSharesReq = function() {
      TransactionHist.checkSharesAvail($scope.investment.target_id, 'buy').then(function(response){
        $scope.requestedShares = response[0];
        $scope.requestedSharesInfo = response[1][0];
        console.log($scope.requestedSharesInfo, 'requestedSharesInfo')
      });
    }
  }
})
