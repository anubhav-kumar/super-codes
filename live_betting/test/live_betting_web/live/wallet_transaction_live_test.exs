defmodule LiveBettingWeb.WalletTransactionLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.AccountsFixtures

  @create_attrs %{type: "some type", amount: "120.5", balance_after: "120.5"}
  @update_attrs %{type: "some updated type", amount: "456.7", balance_after: "456.7"}
  @invalid_attrs %{type: nil, amount: nil, balance_after: nil}
  defp create_wallet_transaction(_) do
    wallet_transaction = wallet_transaction_fixture()

    %{wallet_transaction: wallet_transaction}
  end

  describe "Index" do
    setup [:create_wallet_transaction]

    test "lists all wallet_transactions", %{conn: conn, wallet_transaction: wallet_transaction} do
      {:ok, _index_live, html} = live(conn, ~p"/wallet_transactions")

      assert html =~ "Listing Wallet transactions"
      assert html =~ wallet_transaction.type
    end

    test "saves new wallet_transaction", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/wallet_transactions")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Wallet transaction")
               |> render_click()
               |> follow_redirect(conn, ~p"/wallet_transactions/new")

      assert render(form_live) =~ "New Wallet transaction"

      assert form_live
             |> form("#wallet_transaction-form", wallet_transaction: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#wallet_transaction-form", wallet_transaction: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/wallet_transactions")

      html = render(index_live)
      assert html =~ "Wallet transaction created successfully"
      assert html =~ "some type"
    end

    test "updates wallet_transaction in listing", %{conn: conn, wallet_transaction: wallet_transaction} do
      {:ok, index_live, _html} = live(conn, ~p"/wallet_transactions")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#wallet_transactions-#{wallet_transaction.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/wallet_transactions/#{wallet_transaction}/edit")

      assert render(form_live) =~ "Edit Wallet transaction"

      assert form_live
             |> form("#wallet_transaction-form", wallet_transaction: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#wallet_transaction-form", wallet_transaction: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/wallet_transactions")

      html = render(index_live)
      assert html =~ "Wallet transaction updated successfully"
      assert html =~ "some updated type"
    end

    test "deletes wallet_transaction in listing", %{conn: conn, wallet_transaction: wallet_transaction} do
      {:ok, index_live, _html} = live(conn, ~p"/wallet_transactions")

      assert index_live |> element("#wallet_transactions-#{wallet_transaction.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#wallet_transactions-#{wallet_transaction.id}")
    end
  end

  describe "Show" do
    setup [:create_wallet_transaction]

    test "displays wallet_transaction", %{conn: conn, wallet_transaction: wallet_transaction} do
      {:ok, _show_live, html} = live(conn, ~p"/wallet_transactions/#{wallet_transaction}")

      assert html =~ "Show Wallet transaction"
      assert html =~ wallet_transaction.type
    end

    test "updates wallet_transaction and returns to show", %{conn: conn, wallet_transaction: wallet_transaction} do
      {:ok, show_live, _html} = live(conn, ~p"/wallet_transactions/#{wallet_transaction}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/wallet_transactions/#{wallet_transaction}/edit?return_to=show")

      assert render(form_live) =~ "Edit Wallet transaction"

      assert form_live
             |> form("#wallet_transaction-form", wallet_transaction: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#wallet_transaction-form", wallet_transaction: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/wallet_transactions/#{wallet_transaction}")

      html = render(show_live)
      assert html =~ "Wallet transaction updated successfully"
      assert html =~ "some updated type"
    end
  end
end
