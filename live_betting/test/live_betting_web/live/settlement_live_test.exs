defmodule LiveBettingWeb.SettlementLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.BettingFixtures

  @create_attrs %{total_pool: "120.5", house_cut: "120.5", distributable_pool: "120.5", outcome: "some outcome", settled_at: "2026-02-26T21:01:00Z"}
  @update_attrs %{total_pool: "456.7", house_cut: "456.7", distributable_pool: "456.7", outcome: "some updated outcome", settled_at: "2026-02-27T21:01:00Z"}
  @invalid_attrs %{total_pool: nil, house_cut: nil, distributable_pool: nil, outcome: nil, settled_at: nil}
  defp create_settlement(_) do
    settlement = settlement_fixture()

    %{settlement: settlement}
  end

  describe "Index" do
    setup [:create_settlement]

    test "lists all settlements", %{conn: conn, settlement: settlement} do
      {:ok, _index_live, html} = live(conn, ~p"/settlements")

      assert html =~ "Listing Settlements"
      assert html =~ settlement.outcome
    end

    test "saves new settlement", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/settlements")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Settlement")
               |> render_click()
               |> follow_redirect(conn, ~p"/settlements/new")

      assert render(form_live) =~ "New Settlement"

      assert form_live
             |> form("#settlement-form", settlement: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#settlement-form", settlement: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/settlements")

      html = render(index_live)
      assert html =~ "Settlement created successfully"
      assert html =~ "some outcome"
    end

    test "updates settlement in listing", %{conn: conn, settlement: settlement} do
      {:ok, index_live, _html} = live(conn, ~p"/settlements")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#settlements-#{settlement.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/settlements/#{settlement}/edit")

      assert render(form_live) =~ "Edit Settlement"

      assert form_live
             |> form("#settlement-form", settlement: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#settlement-form", settlement: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/settlements")

      html = render(index_live)
      assert html =~ "Settlement updated successfully"
      assert html =~ "some updated outcome"
    end

    test "deletes settlement in listing", %{conn: conn, settlement: settlement} do
      {:ok, index_live, _html} = live(conn, ~p"/settlements")

      assert index_live |> element("#settlements-#{settlement.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#settlements-#{settlement.id}")
    end
  end

  describe "Show" do
    setup [:create_settlement]

    test "displays settlement", %{conn: conn, settlement: settlement} do
      {:ok, _show_live, html} = live(conn, ~p"/settlements/#{settlement}")

      assert html =~ "Show Settlement"
      assert html =~ settlement.outcome
    end

    test "updates settlement and returns to show", %{conn: conn, settlement: settlement} do
      {:ok, show_live, _html} = live(conn, ~p"/settlements/#{settlement}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/settlements/#{settlement}/edit?return_to=show")

      assert render(form_live) =~ "Edit Settlement"

      assert form_live
             |> form("#settlement-form", settlement: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#settlement-form", settlement: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/settlements/#{settlement}")

      html = render(show_live)
      assert html =~ "Settlement updated successfully"
      assert html =~ "some updated outcome"
    end
  end
end
