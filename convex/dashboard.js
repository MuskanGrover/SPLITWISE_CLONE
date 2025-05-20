//GET USER BALANCES

import { internal } from "./_generated/api";
import { query } from "./_generated/server";

//calculate how much money tge current user owes or is owed from personal 1 to 1 expense
export const getUserBalances=query({
    handler:async(ctx)=>
    {
        //ab yaha pr we are querrying the current user to get their id via internal getCurrentUser function
        const user=await ctx.runQuery(internal.users.getCurrentUser);

        // 1 TO 1 EXPENSES(no groupid)
        // Filter expenses to only include ne to one expenses (not group expenses)
        // where the current user is either the payer or in the splits

        //group mai include nahi hona caiye current user so !e.groupId because it is one to one expens
        //either the current user is the payer or is part of split and has to pay the other user
        const expenses=(await ctx.db.query("expenses").collect()).filter(
            (e)=>
                !e.groupId &&
            (e.paidByUserId === user._id || e.splits.some((s)=>s.userId === user._id))
        );

        let youOwe=0;//TOTAL AMOUNT USER OWES OTHERS(Mujhe dusre ko kitna dena hai)
        let youAreOwed=0;//TOTAL AMOUNT OTHERS OWE THE USER(dusre ko mujhe  kitna paisa dena hai)
        const balanceByUser={};//DETAILED BREAKDOWN PER USER //PROCESS EACH EXPENSE TO CALCULATE BALANCES

        for(const e of expenses)
        {
            const isPayer=e.paidByUserId===user._id;
            const mySplit=e.splits.find((s)=>s.userId===user._id);

            if(isPayer)
            {
                for(const s of e.splits)
                {
                    //SKIP USER'S OWN SPLIT OR ALREADY PAID SPLITS
                    if(s.userId === user._id || s.paid)continue;

                    //ADD TO AMOUNT OWED TO USER
                    youAreOwed+=s.amount;
                    
                    (balanceByUser[s.userId]??={owed:0,owing:0}).owed+=s.amount;
                }
            }
            else if(mySplit && !mySplit.paid)
            {
                //SOMEONE ELSE PAID AND USER HAS NOT PAID IN THAT SPPLIT
                youOwe+=mySplit.amount;
                (balanceByUser[e.paidByUserId]??={owed:0,owing:0}).owing+=mySplit.amount;
            }
        }

        //get settlements
        const settlements=(await ctx.db.query("settlements").collect()).filter(
            (s)=>
            {
                !s.groupId &&
                (s.paidByUserId===user._id || s.receivedByUserId===user._id)
            }
        );

        for(const s of settlements)
        {
            if(s.paidByUserId===user._id)
            {
                //USER PAID SOMEONE ELSE->REDUCE WHAT USER OWES
                youOwe-=s.amount;
                (balanceByUser[s.receivedByUserId]??={owed:0,owing:0}).owing-=s.amount;

            }
            else
            {
                //SOMEONE PAID THE USER->REDUCES WHAT THEY OWE THE USER
                youAreOwed-=s.amount;
                (balanceByUser[s.paidByUserId]??={owed:0,owing:0}).owed-=
                s.amount;
            }
        }


        //LISTS FOR THE FRONTEND
        const youOweList=[];//LIST OF PEOPLE USER OWES MONEY TO
        const youAreOwedByList=[];//LIST OF PEOPLE WHO OWES THE USER


        for(const[uid,{owed,owing}] of Object.entries(balanceByUser))
        {
            //owed: money this person owes to the current user
            //owing: money the current user owes to this person
            //net = owed - owing: a positive value means someone owes you; a negative value means you owe them.
            const net=owed-owing;//NET BALANCE
            if(net===0)continue;


            //Get User Details
            const counterpart=await ctx.db.get(uid);
            const base={
                userId:uid,
                name:counterpart?.name??"Unknown",
                imageUrl:counterpart?.imageUrl,
                amount:Math.abs(net),
            };
            net>0?youAreOwedByList.push(base):youOweList.push(base);
        }
        youOweList.sort((a,b)=>b.amount-a.amount);
        youAreOwedByList.sort((a,b)=>b.amount-a.amount);

        return {
      youOwe,
      youAreOwed,
      totalBalance: youAreOwed - youOwe,
      oweDetails: {
        youOwe: youOweList,
        youAreOwedBy: youAreOwedByList,
      },
    };
    },
});
export const getTotalSpent=query({
    handler:async (ctx)=>
    {
        //Get the timestamp for the start of the year to filter expenses.
        const user=await ctx.runQuery(internal.users.getCurrentUser);
        const currentYear=new Date().getFullYear();
        const startOfYear=new Date(currentYear,0,1).getTime();

        const expenses=await ctx.db.query("expenses").withIndex("by_date",(q)=>q.gte("date",startOfYear)).collect();

        //FILTER EXPENSES TO ONLY INCLUDE THOSE WHERE THE USER IS INVOLVED
        const userExpenses=expenses.filter(
            (expense)=>
            
                expense.paidByUserId===user._id||
                expense.splits.some((split)=>split.userId===user._id)
            
        );
        let totalSpent=0;
        userExpenses.forEach((expense)=>
        {
            const userSplit=expense.splits.find(
                (split)=>split.userId===user._id
            );
            if(userSplit)
            {
                totalSpent+=userSplit.amount;
            }
        })
        return totalSpent;
    }
});
// Get monthly spending
export const getMonthlySpending = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Get current year
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    // Get all expenses for current year
    const allExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_date", (q) => q.gte("date", startOfYear))
      .collect();

    // Filter for expenses where user is involved
    const userExpenses = allExpenses.filter(
      (expense) =>
        expense.paidByUserId === user._id ||
        expense.splits.some((split) => split.userId === user._id)
    );

    // Group expenses by month
    const monthlyTotals = {};

    // Initialize all months with zero
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(currentYear, i, 1);
      monthlyTotals[monthDate.getTime()] = 0;
    }

    // Sum up expenses by month
    userExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      const monthStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      ).getTime();

      // Get user's share of this expense
      const userSplit = expense.splits.find(
        (split) => split.userId === user._id
      );
      if (userSplit) {
        monthlyTotals[monthStart] =
          (monthlyTotals[monthStart] || 0) + userSplit.amount;
      }
    });

    // Convert to array format
    const result = Object.entries(monthlyTotals).map(([month, total]) => ({
      month: parseInt(month),
      total,
    }));

    // Sort by month (ascending)
    result.sort((a, b) => a.month - b.month);

    return result;
  },
});

// Get groups for the current user
export const getUserGroups = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Get all groups
    const allGroups = await ctx.db.query("groups").collect();

    // Filter for groups where the user is a member
    const groups = allGroups.filter((group) =>
      group.members.some((member) => member.userId === user._id)
    );

    // Calculate balances for each group
    const enhancedGroups = await Promise.all(
      groups.map(async (group) => {
        // Get all expenses for this group
        const expenses = await ctx.db
          .query("expenses")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();

        let balance = 0;

        expenses.forEach((expense) => {
          if (expense.paidByUserId === user._id) {
            // User paid for others
            expense.splits.forEach((split) => {
              if (split.userId !== user._id && !split.paid) {
                balance += split.amount;
              }
            });
          } else {
            // User owes someone else
            const userSplit = expense.splits.find(
              (split) => split.userId === user._id
            );
            if (userSplit && !userSplit.paid) {
              balance -= userSplit.amount;
            }
          }
        });

        // Apply settlements
        const settlements = await ctx.db
          .query("settlements")
          .filter((q) =>
            q.and(
              q.eq(q.field("groupId"), group._id),
              q.or(
                q.eq(q.field("paidByUserId"), user._id),
                q.eq(q.field("receivedByUserId"), user._id)
              )
            )
          )
          .collect();

        settlements.forEach((settlement) => {
          if (settlement.paidByUserId === user._id) {
            // User paid someone
            balance += settlement.amount;
          } else {
            // Someone paid the user
            balance -= settlement.amount;
          }
        });

        return {
          ...group,
          id: group._id,
          balance,
        };
      })
    );

    return enhancedGroups;
  },
});