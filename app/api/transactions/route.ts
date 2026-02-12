import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';
import { fetchExchangeRate } from '@/lib/stocks';

// 權限檢查輔助函式
async function requireAdmin() {
  const role = await getUserRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: '無權限執行此操作' }, { status: 403 });
  }
  return null;
}

// GET: 取得交易歷史
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolio_id');

    const supabase = createServerClient();

    let query = supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (portfolioId) {
      query = query.eq('portfolio_id', portfolioId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('取得交易紀錄失敗:', error);
      return NextResponse.json({ error: '取得交易紀錄失敗' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}

// POST: 賣出股票（原子操作：寫紀錄 + 更新持股 + 更新現金）
export async function POST(request: Request) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const body = await request.json();
    const { holding_id, shares: sellShares, price: sellPrice, transaction_date, portfolio_id, notes } = body;

    if (!holding_id || !sellShares || !sellPrice || !transaction_date) {
      return NextResponse.json({ error: '請填寫所有必填欄位' }, { status: 400 });
    }

    const supabase = createServerClient();

    // 取得目標持股
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', holding_id)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json({ error: '找不到該持股' }, { status: 404 });
    }

    const currentShares = Number(holding.shares);
    const sellSharesNum = parseFloat(sellShares);
    const sellPriceNum = parseFloat(sellPrice);

    if (sellSharesNum <= 0) {
      return NextResponse.json({ error: '賣出股數必須大於 0' }, { status: 400 });
    }

    if (sellSharesNum > currentShares) {
      return NextResponse.json(
        { error: `賣出股數 (${sellSharesNum}) 超過持有量 (${currentShares})` },
        { status: 400 }
      );
    }

    // 計算已實現損益 (TWD)
    const costPrice = Number(holding.cost_price);
    const isUS = holding.market === 'US';
    const exchangeRate = isUS ? ((await fetchExchangeRate()) || 32) : 1;
    const realizedPnl = (sellPriceNum - costPrice) * sellSharesNum * exchangeRate;

    // 賣出金額 (TWD)
    const sellAmountTWD = sellPriceNum * sellSharesNum * exchangeRate;

    // 寫入交易紀錄
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        symbol: holding.symbol,
        type: 'sell',
        shares: sellSharesNum,
        price: sellPriceNum,
        transaction_date,
        market: holding.market,
        realized_pnl_twd: Math.round(realizedPnl * 100) / 100,
        holding_id,
        portfolio_id: portfolio_id || holding.portfolio_id || null,
        notes: notes || null,
      });

    if (txError) {
      console.error('寫入交易紀錄失敗:', txError);
      return NextResponse.json({ error: '寫入交易紀錄失敗' }, { status: 500 });
    }

    // 更新持股：部分賣出 → 減少股數，全部賣出 → 刪除
    const remainingShares = currentShares - sellSharesNum;

    if (remainingShares <= 0.00000001) {
      // 全部賣出，刪除持股
      const { error: deleteError } = await supabase
        .from('holdings')
        .delete()
        .eq('id', holding_id);

      if (deleteError) {
        console.error('刪除持股失敗:', deleteError);
        return NextResponse.json({ error: '更新持股失敗' }, { status: 500 });
      }
    } else {
      // 部分賣出，更新股數
      const { error: updateError } = await supabase
        .from('holdings')
        .update({
          shares: remainingShares,
          updated_at: new Date().toISOString(),
        })
        .eq('id', holding_id);

      if (updateError) {
        console.error('更新持股失敗:', updateError);
        return NextResponse.json({ error: '更新持股失敗' }, { status: 500 });
      }
    }

    // 更新現金餘額（加回賣出金額）
    const portfolioFilter = portfolio_id || holding.portfolio_id;
    let cashQuery = supabase.from('cash_balance').select('*');
    if (portfolioFilter) {
      cashQuery = cashQuery.eq('portfolio_id', portfolioFilter);
    }

    const { data: cashData } = await cashQuery.single();

    if (cashData) {
      await supabase
        .from('cash_balance')
        .update({
          amount_twd: Number(cashData.amount_twd) + sellAmountTWD,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cashData.id);
    } else {
      // 沒有現金紀錄就建立一筆
      const insertData: { amount_twd: number; portfolio_id?: string } = {
        amount_twd: sellAmountTWD,
      };
      if (portfolioFilter) {
        insertData.portfolio_id = portfolioFilter;
      }
      await supabase.from('cash_balance').insert(insertData);
    }

    return NextResponse.json({
      data: {
        success: true,
        realized_pnl_twd: Math.round(realizedPnl * 100) / 100,
        remaining_shares: remainingShares > 0.00000001 ? remainingShares : 0,
        cash_added_twd: Math.round(sellAmountTWD),
      },
    });
  } catch (err) {
    console.error('賣出操作失敗:', err);
    return NextResponse.json({ error: '伺服器錯誤' }, { status: 500 });
  }
}
