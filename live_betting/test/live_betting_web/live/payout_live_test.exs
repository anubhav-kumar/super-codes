defmodule LiveBettingWeb.PayoutLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.BettingFixtures

  @create_attrs %{status: "some status", weight_share_pct: "120.5", gross_payout: "120.5", paid_at: "2026-02-26T20:59:00Z"}
  @update_attrs %{status: "some updated status", weight_share_pct: "456.7", gross_payout: "456.7", paid_at: "2026-02-27T20:59:00Z"}
  @invalid_attrs %{status: nil, weight_share_pct: nil, gross_payout: nil, paid_at: nil}
  defp create_payout(_) do
    payout = payout_fixture()

    %{payout: payout}
  end

  describe "Index" do
    setup [:create_payout]

    test "lists all payouts", %{conn: conn, payout: payout} do
      {:ok, _index_live, html} = live(conn, ~p"/payouts")

      assert html =~ "Listing Payouts"
      assert html =~ payout.status
    end

    test "saves new payout", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/payouts")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Payout")
               |> render_click()
               |> follow_redirect(conn, ~p"/payouts/new")

      assert render(form_live) =~ "New Payout"

      assert form_live
             |> form("#payout-form", payout: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#payout-form", payout: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/payouts")

      html = render(index_live)
      assert html =~ "Payout created successfully"
      assert html =~ "some status"
    end

    test "updates payout in listing", %{conn: conn, payout: payout} do
      {:ok, index_live, _html} = live(conn, ~p"/payouts")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#payouts-#{payout.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/payouts/#{payout}/edit")

      assert render(form_live) =~ "Edit Payout"

      assert form_live
             |> form("#payout-form", payout: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#payout-form", payout: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/payouts")

      html = render(index_live)
      assert html =~ "Payout updated successfully"
      assert html =~ "some updated status"
    end

    test "deletes payout in listing", %{conn: conn, payout: payout} do
      {:ok, index_live, _html} = live(conn, ~p"/payouts")

      assert index_live |> element("#payouts-#{payout.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#payouts-#{payout.id}")
    end
  end

  describe "Show" do
    setup [:create_payout]

    test "displays payout", %{conn: conn, payout: payout} do
      {:ok, _show_live, html} = live(conn, ~p"/payouts/#{payout}")

      assert html =~ "Show Payout"
      assert html =~ payout.status
    end

    test "updates payout and returns to show", %{conn: conn, payout: payout} do
      {:ok, show_live, _html} = live(conn, ~p"/payouts/#{payout}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/payouts/#{payout}/edit?return_to=show")

      assert render(form_live) =~ "Edit Payout"

      assert form_live
             |> form("#payout-form", payout: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#payout-form", payout: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/payouts/#{payout}")

      html = render(show_live)
      assert html =~ "Payout updated successfully"
      assert html =~ "some updated status"
    end
  end
end
